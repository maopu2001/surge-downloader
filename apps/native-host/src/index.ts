import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import {
  createEnvelope,
  createErrorEnvelope,
  ErrorCode,
  EnvelopeSchema,
  DownloadAddPayloadSchema,
  GidPayloadSchema,
  DownloadRefreshUrlPayloadSchema,
  DownloadOpenFolderPayloadSchema,
  SelectFolderPayloadSchema,
  CheckFileExistsPayloadSchema,
  CheckFilesStatusPayloadSchema,
  type ProtocolEnvelope,
  type DownloadProgressPayload,
} from "@aria2-browser/protocol";
import { NativeMessageReader, NativeMessageWriter } from "./protocol/codec.js";
import { Aria2DaemonManager } from "./aria2/daemon.js";
import { Aria2RpcClient, type Aria2DownloadStatus } from "./aria2/client.js";
import {
  validateUrl,
  sanitizeFilename,
  sanitizeDirectory,
  sanitizeSubDirectory,
  validateProxy,
  resolveUniqueFilename,
} from "./security/sanitizer.js";
import { resolveSafeTarget, openPathInFileManager } from "./security/folder-opener.js";
import { pickNativeFolder } from "./security/folder-picker.js";
import { cleanDownloadFiles, checkDownloadFilesStatus } from "./security/file-cleaner.js";

const reader = new NativeMessageReader(process.stdin);
const writer = new NativeMessageWriter(process.stdout);
const daemon = new Aria2DaemonManager();
let pollingInterval: NodeJS.Timeout | null = null;

function sendResponse<T>(envelope: ProtocolEnvelope<T>): void {
  try {
    writer.write(envelope);
  } catch (err) {
    // If pipe is broken, ignore or exit
  }
}

function normalizeProgress(task: Aria2DownloadStatus): DownloadProgressPayload {
  const completedBytes = parseInt(task.completedLength || "0", 10);
  const totalBytes = parseInt(task.totalLength || "0", 10);
  const downloadSpeed = parseInt(task.downloadSpeed || "0", 10);
  const uploadSpeed = parseInt(task.uploadSpeed || "0", 10);

  let etaSeconds: number | undefined;
  if (downloadSpeed > 0 && totalBytes > completedBytes) {
    etaSeconds = Math.round((totalBytes - completedBytes) / downloadSpeed);
  }

  return {
    gid: task.gid,
    status: task.status,
    completedBytes,
    totalBytes,
    downloadSpeed,
    uploadSpeed,
    etaSeconds,
    errorMessage: task.errorMessage || undefined,
  };
}

async function pollActiveProgress(client: Aria2RpcClient): Promise<void> {
  try {
    const [activeTasks, waitingTasks, stoppedTasks] = await Promise.all([
      client.tellActive(),
      client.tellWaiting(0, 50),
      client.tellStopped(0, 50),
    ]);
    const all = [...activeTasks, ...waitingTasks, ...stoppedTasks];
    for (const task of all) {
      const progress = normalizeProgress(task);
      sendResponse(createEnvelope("download.progress", progress));
    }
  } catch {
    // Daemon might not be ready or active
  }
}

function startPolling(client: Aria2RpcClient): void {
  if (pollingInterval) return;
  pollingInterval = setInterval(() => {
    void pollActiveProgress(client);
  }, 1000);
}

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

async function handleMessage(rawMessage: unknown): Promise<void> {
  const envelopeResult = EnvelopeSchema.safeParse(rawMessage);
  if (!envelopeResult.success) {
    sendResponse(
      createErrorEnvelope(
        ErrorCode.INVALID_MESSAGE,
        "Malformed message envelope",
        undefined,
        envelopeResult.error.flatten()
      )
    );
    return;
  }

  const { type, requestId, payload } = envelopeResult.data;

  switch (type) {
    case "ping": {
      sendResponse(
        createEnvelope("pong", { timestamp: Date.now() }, requestId)
      );
      break;
    }

    case "aria2.status": {
      try {
        const info = await daemon.ensureRunning();
        startPolling(daemon.getClient());
        sendResponse(
          createEnvelope(
            "aria2.ready",
            { version: info.version, port: info.port },
            requestId
          )
        );
      } catch (err) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.ARIA2_UNAVAILABLE,
            `aria2c unavailable: ${(err as Error).message}`,
            requestId
          )
        );
      }
      break;
    }

    case "download.add": {
      const parsed = DownloadAddPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_MESSAGE,
            "Invalid download.add payload",
            requestId,
            parsed.error.flatten()
          )
        );
        return;
      }

      const { url, filename, directory, headers, options: payloadOptions } = parsed.data;

      // 1. URL validation (supports single URL or array of mirrors)
      const urls = Array.isArray(url) ? url : [url];
      for (const u of urls) {
        const urlCheck = validateUrl(u);
        if (!urlCheck.valid) {
          sendResponse(
            createErrorEnvelope(
              ErrorCode.INVALID_URL,
              urlCheck.error || "Forbidden or invalid URL",
              requestId
            )
          );
          return;
        }
      }

      // 2. Directory validation & resolution
      const dirCheck = sanitizeDirectory(directory);
      if (!dirCheck.valid || !dirCheck.sanitizedPath) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_DIRECTORY,
            dirCheck.error || "Invalid download directory",
            requestId
          )
        );
        return;
      }

      let targetDir = dirCheck.sanitizedPath;
      if (payloadOptions?.subDirectory) {
        const subCheck = sanitizeSubDirectory(targetDir, payloadOptions.subDirectory);
        if (!subCheck.valid || !subCheck.sanitizedPath) {
          sendResponse(
            createErrorEnvelope(
              ErrorCode.INVALID_DIRECTORY,
              subCheck.error || "Invalid subdirectory",
              requestId
            )
          );
          return;
        }
        targetDir = subCheck.sanitizedPath;
      }

      // 3. Proxy validation
      if (payloadOptions?.allProxy) {
        const proxyCheck = validateProxy(payloadOptions.allProxy);
        if (!proxyCheck.valid) {
          sendResponse(
            createErrorEnvelope(
              ErrorCode.INVALID_MESSAGE,
              proxyCheck.error || "Invalid proxy URL",
              requestId
            )
          );
          return;
        }
      }

      // 4. Filename sanitization
      let sanitizedOut: string | undefined;
      if (filename) {
        const fileCheck = sanitizeFilename(filename);
        if (!fileCheck.valid) {
          sendResponse(
            createErrorEnvelope(
              ErrorCode.INVALID_MESSAGE,
              fileCheck.error || "Invalid filename",
              requestId
            )
          );
          return;
        }
        sanitizedOut = fileCheck.sanitizedFilename;
      }

      // 5. Ensure daemon is running
      try {
        await daemon.ensureRunning();
        startPolling(daemon.getClient());
      } catch (err) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.ARIA2_UNAVAILABLE,
            `aria2c process error: ${(err as Error).message}`,
            requestId
          )
        );
        return;
      }

      // 6. Build options and dispatch to aria2c
      if (sanitizedOut) {
        const fullTarget = path.join(targetDir, sanitizedOut);
        if (fs.existsSync(fullTarget) && !fs.existsSync(`${fullTarget}.aria2`)) {
          if (payloadOptions?.allowOverwrite !== true) {
            sendResponse(
              createErrorEnvelope(
                ErrorCode.FILE_ALREADY_EXISTS,
                `File '${sanitizedOut}' already exists in destination folder. Please rename before downloading.`,
                requestId
              )
            );
            return;
          }
        }
      }

      const options: Record<string, string | string[]> = {
        dir: targetDir,
        "auto-file-renaming": "false",
        "allow-overwrite": "false",
        pause: payloadOptions?.pause !== undefined ? String(payloadOptions.pause) : "false",
      };
      if (sanitizedOut) {
        options.out = sanitizedOut;
      }

      // Map Aria2 tuning options
      if (payloadOptions) {
        if (payloadOptions.split) options.split = String(payloadOptions.split);
        if (payloadOptions.maxConnectionPerServer) options["max-connection-per-server"] = String(payloadOptions.maxConnectionPerServer);
        if (payloadOptions.minSplitSize) options["min-split-size"] = payloadOptions.minSplitSize;
        if (payloadOptions.maxDownloadLimit && payloadOptions.maxDownloadLimit !== "0") options["max-download-limit"] = payloadOptions.maxDownloadLimit;
        if (payloadOptions.lowestSpeedLimit) options["lowest-speed-limit"] = payloadOptions.lowestSpeedLimit;
        if (payloadOptions.allProxy) options["all-proxy"] = payloadOptions.allProxy;
        if (payloadOptions.checksum) options.checksum = payloadOptions.checksum;
        if (payloadOptions.continueDownload !== undefined) options.continue = String(payloadOptions.continueDownload);
        if (payloadOptions.maxTries) options["max-tries"] = String(payloadOptions.maxTries);
        if (payloadOptions.retryWait) options["retry-wait"] = String(payloadOptions.retryWait);
        if (payloadOptions.timeout) options.timeout = String(payloadOptions.timeout);
        if (payloadOptions.connectTimeout) options["connect-timeout"] = String(payloadOptions.connectTimeout);
        if (payloadOptions.checkCertificate !== undefined) options["check-certificate"] = String(payloadOptions.checkCertificate);
      }

      const headerList: string[] = [];
      if (headers?.userAgent) {
        headerList.push(`User-Agent: ${headers.userAgent}`);
      }
      if (headers?.referer) {
        headerList.push(`Referer: ${headers.referer}`);
      }
      if (headers?.cookie) {
        headerList.push(`Cookie: ${headers.cookie}`);
      }
      if (headers?.accept) {
        headerList.push(`Accept: ${headers.accept}`);
      }
      if (headers?.acceptLanguage) {
        headerList.push(`Accept-Language: ${headers.acceptLanguage}`);
      }
      if (headers?.secChUa) {
        headerList.push(`Sec-Ch-Ua: ${headers.secChUa}`);
      }
      if (headers?.customHeaders && Array.isArray(headers.customHeaders)) {
        for (const h of headers.customHeaders) {
          if (h && typeof h === "string" && h.includes(":")) {
            headerList.push(h);
          }
        }
      }
      if (headerList.length > 0) {
        options.header = headerList;
      }

      try {
        const gid = await daemon.getClient().addUri(urls, options);
        sendResponse(
          createEnvelope("download.added", { gid, url: urls[0] }, requestId)
        );
      } catch (err) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.ARIA2_ADD_FAILED,
            `Failed to add download to aria2c: ${(err as Error).message}`,
            requestId
          )
        );
      }
      break;
    }

    case "download.pause": {
      const parsed = GidPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_MESSAGE,
            "Invalid GID payload",
            requestId
          )
        );
        return;
      }
      try {
        await daemon.getClient().pause(parsed.data.gid);
        sendResponse(createEnvelope("download.paused", { gid: parsed.data.gid }, requestId));
      } catch (err) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.GID_NOT_FOUND,
            `Pause failed: ${(err as Error).message}`,
            requestId
          )
        );
      }
      break;
    }

    case "download.resume": {
      const parsed = GidPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_MESSAGE,
            "Invalid GID payload",
            requestId
          )
        );
        return;
      }
      try {
        await daemon.getClient().unpause(parsed.data.gid);
        sendResponse(createEnvelope("download.resumed", { gid: parsed.data.gid }, requestId));
      } catch (err) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.GID_NOT_FOUND,
            `Resume failed: ${(err as Error).message}`,
            requestId
          )
        );
      }
      break;
    }

    case "download.cancel": {
      const parsed = GidPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_MESSAGE,
            "Invalid GID payload",
            requestId
          )
        );
        return;
      }
      try {
        await daemon.getClient().remove(parsed.data.gid);
        sendResponse(createEnvelope("download.cancelled", { gid: parsed.data.gid }, requestId));
      } catch (err) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.GID_NOT_FOUND,
            `Cancel failed: ${(err as Error).message}`,
            requestId
          )
        );
      }
      break;
    }

    case "download.remove": {
      const parsed = GidPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_MESSAGE,
            "Invalid GID payload",
            requestId
          )
        );
        return;
      }
      try {
        const { gid, filename, directory, deleteFile, isCompleted } = parsed.data;
        const client = daemon.getClient();
        let shouldDelete = Boolean(deleteFile || isCompleted !== true);

        const targetFiles: string[] = [];
        let targetDir = directory || "";

        try {
          const status = await client.tellStatus(gid);
          if (status.status !== "complete") {
            shouldDelete = true;
          }
          if (status.dir) targetDir = status.dir;
          if (status.files && Array.isArray(status.files)) {
            for (const f of status.files) {
              if (f.path) targetFiles.push(f.path);
            }
          }
        } catch {
          // tellStatus error if already removed or not found in daemon
        }

        // 1. Stop and remove download from aria2 daemon first so file locks are released
        try {
          await client.remove(gid);
        } catch {}

        // 2. If incomplete or delete requested, completely purge files & .aria2 metadata
        const cleanResult = cleanDownloadFiles({
          gid,
          directory: targetDir,
          filename,
          filePaths: targetFiles,
          shouldDelete,
        });

        // 3. Purge download result record from aria2 memory
        try {
          await client.removeDownloadResult(gid);
        } catch {}

        sendResponse(
          createEnvelope(
            "download.removed",
            { gid, fileDeleted: cleanResult.fileDeleted },
            requestId
          )
        );
      } catch (err) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.GID_NOT_FOUND,
            `Remove failed: ${(err as Error).message}`,
            requestId
          )
        );
      }
      break;
    }

    case "download.refreshUrl": {
      const parsed = DownloadRefreshUrlPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_MESSAGE,
            "Invalid refreshUrl payload",
            requestId
          )
        );
        return;
      }

      const { gid, newUrl, filename, directory, headers, options: payloadOptions } = parsed.data;
      const urlCheck = validateUrl(newUrl);
      if (!urlCheck.valid) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_URL,
            urlCheck.error || "Invalid URL",
            requestId
          )
        );
        return;
      }

      const client = daemon.getClient();
      let newGid = gid;
      let changedInPlace = false;

      // 1. Try to change URI in-place if task is active/paused/waiting in aria2c
      try {
        const status = await client.tellStatus(gid);
        if (status.status === "active" || status.status === "waiting" || status.status === "paused") {
          if (status.status === "active") {
            try {
              await client.pause(gid);
            } catch {
              // ignore
            }
          }
          const oldUris = status.files?.[0]?.uris?.map((u) => u.uri) || [];
          await client.changeUri(gid, 1, oldUris, [newUrl]);
          try {
            await client.unpause(gid);
          } catch {
            // ignore
          }
          changedInPlace = true;
        }
      } catch {
        changedInPlace = false;
      }

      // 2. If task was stopped or changeUri rejected: re-add with continue: "true" and full headers & options
      if (!changedInPlace) {
        try {
          const dirCheck = sanitizeDirectory(directory);
          let targetDir = dirCheck.sanitizedPath || "";
          let targetOut = filename;

          try {
            const status = await client.tellStatus(gid);
            if (status.dir) targetDir = status.dir;
            if (status.files?.[0]?.path) {
              targetOut = status.files[0].path.split(/[/\\]/).pop();
            }
          } catch {
            // ignore
          }

          const options: Record<string, string | string[]> = {
            dir: targetDir,
            continue: "true",
            "auto-file-renaming": "false",
            "allow-overwrite": "true",
            pause: payloadOptions?.pause !== undefined ? String(payloadOptions.pause) : "false",
          };
          if (targetOut) {
            options.out = targetOut;
          }

          // Map Aria2 tuning options
          if (payloadOptions) {
            if (payloadOptions.split) options.split = String(payloadOptions.split);
            if (payloadOptions.maxConnectionPerServer) options["max-connection-per-server"] = String(payloadOptions.maxConnectionPerServer);
            if (payloadOptions.minSplitSize) options["min-split-size"] = payloadOptions.minSplitSize;
            if (payloadOptions.maxDownloadLimit && payloadOptions.maxDownloadLimit !== "0") options["max-download-limit"] = payloadOptions.maxDownloadLimit;
            if (payloadOptions.lowestSpeedLimit) options["lowest-speed-limit"] = payloadOptions.lowestSpeedLimit;
            if (payloadOptions.allProxy) options["all-proxy"] = payloadOptions.allProxy;
            if (payloadOptions.checksum) options.checksum = payloadOptions.checksum;
            if (payloadOptions.maxTries) options["max-tries"] = String(payloadOptions.maxTries);
            if (payloadOptions.retryWait) options["retry-wait"] = String(payloadOptions.retryWait);
            if (payloadOptions.timeout) options.timeout = String(payloadOptions.timeout);
            if (payloadOptions.connectTimeout) options["connect-timeout"] = String(payloadOptions.connectTimeout);
            if (payloadOptions.checkCertificate !== undefined) options["check-certificate"] = String(payloadOptions.checkCertificate);
          }

          const headerList: string[] = [];
          if (headers?.userAgent) headerList.push(`User-Agent: ${headers.userAgent}`);
          if (headers?.referer) headerList.push(`Referer: ${headers.referer}`);
          if (headers?.cookie) headerList.push(`Cookie: ${headers.cookie}`);
          if (headers?.accept) headerList.push(`Accept: ${headers.accept}`);
          if (headers?.acceptLanguage) headerList.push(`Accept-Language: ${headers.acceptLanguage}`);
          if (headers?.secChUa) headerList.push(`Sec-Ch-Ua: ${headers.secChUa}`);
          if (headers?.customHeaders && Array.isArray(headers.customHeaders)) {
            for (const h of headers.customHeaders) {
              if (h && typeof h === "string" && h.includes(":")) {
                headerList.push(h);
              }
            }
          }
          if (headerList.length > 0) {
            options.header = headerList;
          }

          // Clean up old stopped task result from aria2 memory
          await client.removeDownloadResult(gid).catch(() => {});

          newGid = await client.addUri([newUrl], options);
        } catch (err) {
          sendResponse(
            createErrorEnvelope(
              ErrorCode.ARIA2_ADD_FAILED,
              `Refresh URL failed: ${(err as Error).message}`,
              requestId
            )
          );
          return;
        }
      }

      sendResponse(
        createEnvelope(
          "download.urlRefreshed",
          { oldGid: gid, newGid, url: newUrl },
          requestId
        )
      );
      break;
    }

    case "download.pauseAll": {
      try {
        await daemon.getClient().pauseAll();
        sendResponse(createEnvelope("download.pausedAll", {}, requestId));
      } catch (err) {
        sendResponse(createErrorEnvelope(ErrorCode.ARIA2_UNAVAILABLE, `PauseAll failed: ${(err as Error).message}`, requestId));
      }
      break;
    }

    case "download.resumeAll": {
      try {
        await daemon.getClient().unpauseAll();
        sendResponse(createEnvelope("download.resumedAll", {}, requestId));
      } catch (err) {
        sendResponse(createErrorEnvelope(ErrorCode.ARIA2_UNAVAILABLE, `ResumeAll failed: ${(err as Error).message}`, requestId));
      }
      break;
    }

    case "download.sync": {
      try {
        const client = daemon.getClient();
        const [active, waiting, stopped] = await Promise.all([
          client.tellActive(),
          client.tellWaiting(0, 100),
          client.tellStopped(0, 100),
        ]);

        const allTasks = [...active, ...waiting, ...stopped];
        for (const task of allTasks) {
          sendResponse(
            createEnvelope("download.progress", normalizeProgress(task))
          );
        }

        const activeGids = allTasks.map((t) => t.gid);
        sendResponse(
          createEnvelope("download.synced", { activeGids }, requestId)
        );
      } catch (err) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.ARIA2_UNAVAILABLE,
            `Sync failed: ${(err as Error).message}`,
            requestId
          )
        );
      }
      break;
    }

    case "download.openFolder": {
      const parsed = DownloadOpenFolderPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_MESSAGE,
            "Invalid openFolder payload",
            requestId
          )
        );
        return;
      }

      const { gid, directory, filename } = parsed.data;
      let targetPath: string | undefined;
      let isDirectory = false;

      // 1. If gid provided, query aria2c for task status
      if (gid) {
        try {
          const status = await daemon.getClient().tellStatus(gid);
          if (status.files && status.files.length > 0 && status.files[0].path) {
            const filePath = status.files[0].path;
            if (fs.existsSync(filePath)) {
              targetPath = filePath;
              isDirectory = false;
            }
          }
          if (!targetPath && status.dir && fs.existsSync(status.dir)) {
            targetPath = status.dir;
            isDirectory = true;
          }
        } catch {
          // Task might not exist in aria2 memory anymore, fallback to local path check
        }
      }

      // 2. Fallback to directory + filename resolution
      if (!targetPath) {
        const safe = resolveSafeTarget(directory, filename);
        targetPath = safe.targetPath;
        isDirectory = safe.isDirectory;
      }

      try {
        await openPathInFileManager({ targetPath, isDirectory });
        sendResponse(
          createEnvelope(
            "download.folderOpened",
            { success: true, path: targetPath },
            requestId
          )
        );
      } catch (err) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_DIRECTORY,
            `Failed to open folder: ${(err as Error).message}`,
            requestId
          )
        );
      }
      break;
    }

    case "dialog.selectFolder": {
      const parsed = SelectFolderPayloadSchema.safeParse(payload);
      const title = parsed.success && parsed.data.prompt ? parsed.data.prompt : "Select Download Folder";
      const defaultPath = parsed.success && parsed.data.defaultPath ? parsed.data.defaultPath : undefined;
      try {
        const result = await pickNativeFolder(title, defaultPath);
        sendResponse(createEnvelope("dialog.folderSelected", result, requestId));
      } catch (err) {
        sendResponse(
          createEnvelope("dialog.folderSelected", { canceled: true, error: (err as Error).message }, requestId)
        );
      }
      break;
    }

    case "file.checkExists": {
      const parsed = CheckFileExistsPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        sendResponse(createErrorEnvelope(ErrorCode.INVALID_MESSAGE, "Invalid checkExists payload", requestId));
        break;
      }
      const { filename, directory } = parsed.data;
      const dirCheck = sanitizeDirectory(directory);
      const fileCheck = sanitizeFilename(filename);
      if (!dirCheck.valid || !dirCheck.sanitizedPath || !fileCheck.valid || !fileCheck.sanitizedFilename) {
        sendResponse(createEnvelope("file.checkResult", { exists: false, path: "", isCompleted: false }, requestId));
        break;
      }
      const fullPath = path.join(dirCheck.sanitizedPath, fileCheck.sanitizedFilename);
      const fileExists = fs.existsSync(fullPath);
      const ariaControlExists = fs.existsSync(`${fullPath}.aria2`);
      const isCompleted = fileExists && !ariaControlExists;
      sendResponse(createEnvelope("file.checkResult", { exists: fileExists, path: fullPath, isCompleted }, requestId));
      break;
    }

    case "download.checkFilesStatus": {
      const parsed = CheckFilesStatusPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        sendResponse(
          createErrorEnvelope(
            ErrorCode.INVALID_MESSAGE,
            "Invalid checkFilesStatus payload",
            requestId
          )
        );
        break;
      }
      const results = checkDownloadFilesStatus(parsed.data.items);
      sendResponse(
        createEnvelope("download.filesStatusResult", { results }, requestId)
      );
      break;
    }

    default: {
      sendResponse(
        createErrorEnvelope(
          ErrorCode.INVALID_MESSAGE,
          `Unknown message type: ${type}`,
          requestId
        )
      );
      break;
    }
  }
}

reader.on("message", (msg) => {
  void handleMessage(msg);
});

reader.on("error", (err) => {
  sendResponse(
    createErrorEnvelope(
      ErrorCode.INVALID_MESSAGE,
      `Stream decoding error: ${err.message}`
    )
  );
});

let isCleaningUp = false;

async function cleanupAndExit(): Promise<void> {
  if (isCleaningUp) return;
  isCleaningUp = true;
  stopPolling();
  try {
    await Promise.race([
      daemon.getClient().saveSession(250),
      new Promise((resolve) => setTimeout(resolve, 300)),
    ]);
  } catch {
    // Daemon might not be running or already closed
  }
  daemon.stop();
  process.exit(0);
}

reader.on("end", () => {
  void cleanupAndExit();
});
reader.on("close", () => {
  void cleanupAndExit();
});
process.stdin.on("end", () => {
  void cleanupAndExit();
});
process.stdin.on("close", () => {
  void cleanupAndExit();
});
process.stdin.on("error", () => {
  void cleanupAndExit();
});
process.on("SIGINT", () => {
  void cleanupAndExit();
});
process.on("SIGTERM", () => {
  void cleanupAndExit();
});
