import {
  type DownloadBinding,
  type ExtensionSettings,
  type DownloadProgressPayload,
  type Aria2DownloadOptions,
  type PendingPromptItem,
  type AwaitingRefreshState,
  type RefreshPromptItem,
  type SelectFolderResultPayload,
  DEFAULT_SETTINGS,
} from "@aria2-browser/protocol";
import { nativeBridge } from "./native-bridge.js";
import {
  evaluateDownloadInterception,
  extractCleanFilename,
  getFileExtension,
  resolveSubDirectory,
  resolveAria2Options,
} from "./rules-engine.js";

const STORAGE_BINDINGS_KEY = "aria2_download_bindings";
const STORAGE_SETTINGS_KEY = "aria2_settings";

export class DownloadInterceptor {
  private bindings = new Map<string, DownloadBinding>();
  private settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
  private handledBrowserIds = new Set<number>();
  private pendingSuggests = new Map<number, (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void>();
  private pendingPrompts = new Map<number, PendingPromptItem>();
  private awaitingRefresh: AwaitingRefreshState | null = null;
  private awaitingRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshPrompt: RefreshPromptItem | null = null;

  constructor() {
    this.setupListeners();
  }

  public async initialize(): Promise<void> {
    await this.loadSettings();
    await this.loadBindings();

    nativeBridge.onProgress((progress) => {
      this.handleAria2Progress(progress);
    });

    nativeBridge.onStatus((connected, error) => {
      if (connected) {
        console.info("[bridge] Native Messaging Host connected successfully");
      } else {
        console.warn("[bridge] Native Messaging Host disconnected", error);
      }
    });
  }

  public async loadSettings(): Promise<ExtensionSettings> {
    const data = await chrome.storage.local.get(STORAGE_SETTINGS_KEY);
    if (data[STORAGE_SETTINGS_KEY]) {
      this.settings = { ...DEFAULT_SETTINGS, ...data[STORAGE_SETTINGS_KEY] };
    } else {
      await chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: DEFAULT_SETTINGS });
      this.settings = { ...DEFAULT_SETTINGS };
    }
    return this.settings;
  }

  public async updateSettings(newSettings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    this.settings = { ...this.settings, ...newSettings };
    await chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: this.settings });
    return this.settings;
  }

  public getSettings(): ExtensionSettings {
    return this.settings;
  }

  public getBindings(): DownloadBinding[] {
    return Array.from(this.bindings.values());
  }

  public async syncWithNativeHost(): Promise<void> {
    try {
      const res = await nativeBridge.syncDownloads();
      const activeGids = new Set(res?.activeGids || []);

      let changed = false;
      const now = Date.now();

      for (const [gid, item] of this.bindings.entries()) {
        // Skip browser-native downloads
        if (!gid || gid.startsWith("b-")) continue;

        // If unfinished and missing from aria2 daemon/session
        if (
          item.state !== "completed" &&
          item.state !== "cancelled" &&
          item.state !== "failed" &&
          item.state !== "file-missing"
        ) {
          if (!activeGids.has(gid)) {
            item.state = "failed";
            item.speed = 0;
            item.errorMessage = "Task not found in session";
            item.updatedAt = now;
            changed = true;
          }
        }
      }

      if (changed) {
        await this.saveBindings();
      }
    } catch {
      // ignore
    }
  }

  public async pauseDownload(gid: string): Promise<void> {
    const item = this.bindings.get(gid);
    if (item) {
      item.state = "paused";
      item.speed = 0;
      await this.saveBindings();
    }
    await nativeBridge.pauseDownload(gid);
  }

  public async resumeDownload(gid: string): Promise<void> {
    const item = this.bindings.get(gid);
    if (item) {
      item.state = "aria2-active";
      await this.saveBindings();
    }
    await nativeBridge.resumeDownload(gid);
  }

  public async cancelDownload(gid: string): Promise<void> {
    const item = this.bindings.get(gid);
    if (item) {
      item.state = "cancelled";
      item.speed = 0;
      await this.saveBindings();
    }
    await nativeBridge.cancelDownload(gid);
  }

  public async pauseAll(): Promise<void> {
    for (const item of this.bindings.values()) {
      if (item.state === "aria2-active") {
        item.state = "paused";
        item.speed = 0;
      }
    }
    await this.saveBindings();
    await nativeBridge.pauseAllDownloads();
  }

  public async resumeAll(): Promise<void> {
    for (const item of this.bindings.values()) {
      if (item.state === "paused") {
        item.state = "aria2-active";
      }
    }
    await this.saveBindings();
    await nativeBridge.resumeAllDownloads();
  }

  public async removeBinding(gid: string, deleteFile = false): Promise<void> {
    const item = this.bindings.get(gid);
    const isCompleted = item?.state === "completed";
    // If not completed (paused, failed, cancelled, in_progress, etc.), ALWAYS purge partial file from storage!
    const shouldDelete = Boolean(deleteFile || !isCompleted);

    this.bindings.delete(gid);
    await this.saveBindings();

    try {
      if (gid && !gid.startsWith("b-")) {
        await nativeBridge.removeDownload(gid, {
          filename: item?.filename,
          directory: item?.directory || this.settings.downloadDirectory || undefined,
          deleteFile: shouldDelete,
          isCompleted,
        });
      } else if (item?.browserId && item.browserId > 0 && !isCompleted) {
        try { await chrome.downloads.cancel(item.browserId); } catch {}
        try { await chrome.downloads.erase({ id: item.browserId }); } catch {}
        try { await chrome.downloads.removeFile(item.browserId); } catch {}
      }
    } catch {
      // ignore
    }
  }

  public async openFolder(gid?: string, filename?: string): Promise<{ success: boolean; path?: string }> {
    const item = gid ? this.bindings.get(gid) : undefined;
    const directory = item?.directory || this.settings.downloadDirectory || undefined;
    const targetFilename = filename || item?.filename || undefined;
    return nativeBridge.openFolder({
      gid: gid && !gid.startsWith("b-") ? gid : undefined,
      directory,
      filename: targetFilename,
    });
  }

  public async clearFinishedBindings(deleteFiles = false): Promise<void> {
    for (const [gid, item] of Array.from(this.bindings.entries())) {
      if (
        item.state === "completed" ||
        item.state === "failed" ||
        item.state === "cancelled" ||
        item.state === "file-missing"
      ) {
        const isCompleted = item.state === "completed";
        // If not completed, always wipe from storage
        const shouldDelete = Boolean(deleteFiles || !isCompleted);

        this.bindings.delete(gid);
        try {
          if (gid && !gid.startsWith("b-")) {
            await nativeBridge.removeDownload(gid, {
              filename: item.filename,
              directory: item.directory || this.settings.downloadDirectory || undefined,
              deleteFile: shouldDelete,
              isCompleted,
            });
          } else if (item.browserId && item.browserId > 0 && !isCompleted) {
            try { await chrome.downloads.cancel(item.browserId); } catch {}
            try { await chrome.downloads.erase({ id: item.browserId }); } catch {}
            try { await chrome.downloads.removeFile(item.browserId); } catch {}
          }
        } catch {
          // ignore
        }
      }
    }
    await this.saveBindings();
  }

  public async verifyFilesIntegrity(): Promise<DownloadBinding[]> {
    const candidateList = Array.from(this.bindings.values()).filter((b) => {
      if (!b.gid || b.gid.startsWith("b-")) return false;
      if (
        b.state === "browser-active" ||
        b.state === "handoff-pending" ||
        b.state === "aria2-added"
      ) {
        return false;
      }
      // Never check 0-byte non-completed downloads: no data has been written to disk yet
      if (
        b.receivedBytes === 0 &&
        b.state !== "completed" &&
        b.state !== "file-missing"
      ) {
        return false;
      }
      return true;
    });
    if (candidateList.length === 0) {
      return this.getBindings();
    }

    const items = candidateList.map((b) => ({
      gid: b.gid,
      filename: b.filename,
      directory: b.directory || this.settings.downloadDirectory || undefined,
      isCompleted: b.state === "completed",
    }));

    try {
      const results = await nativeBridge.checkFilesStatus(items);
      let changed = false;

      for (const res of results) {
        const item = this.bindings.get(res.gid);
        if (!item) continue;

        if (res.missing) {
          if (item.state !== "file-missing") {
            item.state = "file-missing";
            item.speed = 0;
            item.errorMessage = res.reason || "File missing on disk";
            item.updatedAt = Date.now();
            changed = true;
          }
        } else if (item.state === "file-missing") {
          // Restored
          item.state = "completed";
          item.errorMessage = undefined;
          item.updatedAt = Date.now();
          changed = true;
        }
      }

      if (changed) {
        await this.saveBindings();
      }
    } catch {
      // ignore
    }

    return this.getBindings();
  }

  public async restartDownload(gid: string): Promise<DownloadBinding> {
    const existing = this.bindings.get(gid);
    if (!existing) {
      throw new Error("Task not found");
    }
    if (!existing.url) {
      throw new Error("Cannot restart download without URL");
    }

    // 1. Purge any remnant task/files
    try {
      await nativeBridge.removeDownload(gid, {
        filename: existing.filename,
        directory: existing.directory || this.settings.downloadDirectory || undefined,
        deleteFile: true,
        isCompleted: false,
      });
    } catch {}

    // 2. Dispatch fresh download to aria2
    const targetUrl = existing.url;
    const cleanName = existing.filename;
    const targetDir = existing.directory || this.settings.downloadDirectory || undefined;

    const baseOptions = resolveAria2Options(
      {
        url: targetUrl,
        filename: cleanName,
      },
      this.settings
    );
    const finalOptions: Aria2DownloadOptions = {
      ...baseOptions,
      allowOverwrite: true,
      continueDownload: false,
    };

    const headers = await this.collectDownloadHeaders(targetUrl);

    try {
      const addResult = await nativeBridge.addDownload({
        url: targetUrl,
        filename: cleanName || undefined,
        directory: targetDir,
        headers,
        options: finalOptions,
      });

      const newGid = addResult.gid;

      existing.state = "aria2-active";
      existing.receivedBytes = 0;
      existing.speed = 0;
      existing.errorMessage = undefined;
      existing.createdAt = Date.now();
      existing.updatedAt = Date.now();

      if (newGid !== gid) {
        this.bindings.delete(gid);
        existing.gid = newGid;
        this.bindings.set(newGid, existing);
      }

      await this.saveBindings();

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-48.png",
        title: "Surge — Download Restarted",
        message: `${cleanName || targetUrl} download restarted.`,
      });

      return existing;
    } catch (err) {
      const msg = (err as Error).message;
      existing.state = "file-missing";
      existing.errorMessage = `Restart failed: ${msg}`;
      await this.saveBindings();
      throw err;
    }
  }

  private async updateBadge(): Promise<void> {
    try {
      if (this.refreshPrompt) {
        await chrome.action.setBadgeText({ text: "WARN" });
        await chrome.action.setBadgeBackgroundColor({ color: "#f97316" });
      } else if (this.pendingPrompts.size > 0) {
        const hasConflict = Array.from(this.pendingPrompts.values()).some((p) => p.hasConflict);
        await chrome.action.setBadgeText({ text: String(this.pendingPrompts.size) });
        await chrome.action.setBadgeBackgroundColor({ color: hasConflict ? "#e11d48" : "#0284c7" });
      } else if (this.awaitingRefresh) {
        await chrome.action.setBadgeText({ text: "WAIT" });
        await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
      } else {
        await chrome.action.setBadgeText({ text: "" });
      }
    } catch {
      // ignore
    }
  }

  public startAwaitingRefresh(gid: string): { success: boolean; error?: string } {
    const existing = this.bindings.get(gid);
    if (!existing) {
      return { success: false, error: "Task not found" };
    }

    this.cancelAwaitingRefresh();

    const timeoutSec = this.settings.refreshCaptureTimeoutSeconds || 30;
    this.awaitingRefresh = {
      gid,
      filename: existing.filename,
      directory: existing.directory,
      originalUrl: existing.url,
      startedAt: Date.now(),
      timeoutSeconds: timeoutSec,
    };

    this.awaitingRefreshTimer = setTimeout(async () => {
      if (this.awaitingRefresh?.gid === gid) {
        const task = this.bindings.get(gid);
        if (task && (task.state === "error" || task.state === "paused" || task.state === "aria2-active")) {
          task.state = "error";
          task.errorMessage = "Refresh link capture timed out. Download marked as failed.";
          task.speed = 0;
          await this.saveBindings();
        }
        this.cancelAwaitingRefresh();
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-48.png",
          title: "Surge — Refresh Link Timed Out",
          message: `Capture timed out for ${existing.filename}. Task marked as failed.`,
        });
      }
    }, timeoutSec * 1000);

    void this.updateBadge();

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-48.png",
      title: "Surge — Ready to Capture Refresh Link",
      message: `Click download on the webpage within ${timeoutSec}s to resume '${existing.filename}'.`,
    });

    return { success: true };
  }

  public cancelAwaitingRefresh(): void {
    if (this.awaitingRefreshTimer) {
      clearTimeout(this.awaitingRefreshTimer);
      this.awaitingRefreshTimer = null;
    }
    this.awaitingRefresh = null;
    void this.updateBadge();
  }

  public getAwaitingRefresh(): AwaitingRefreshState | null {
    return this.awaitingRefresh;
  }

  public getRefreshPrompt(): RefreshPromptItem | null {
    return this.refreshPrompt;
  }

  public async resolveRefreshPrompt(action: "accept" | "cancel"): Promise<void> {
    if (!this.refreshPrompt) return;
    const prompt = this.refreshPrompt;
    const suggest = this.pendingSuggests.get(prompt.browserDownloadId);
    this.pendingSuggests.delete(prompt.browserDownloadId);
    this.refreshPrompt = null;
    this.cancelAwaitingRefresh();

    if (action === "accept") {
      if (suggest) {
        try { suggest(); } catch {}
      }
      try {
        await chrome.downloads.cancel(prompt.browserDownloadId);
        await chrome.downloads.erase({ id: prompt.browserDownloadId });
      } catch {}

      const headers = await this.collectDownloadHeaders(prompt.newUrl);
      try {
        await this.refreshDownloadUrl(prompt.targetGid, prompt.newUrl, headers);
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-48.png",
          title: "Surge — Link Refreshed & Resumed",
          message: `Captured fresh link for ${prompt.targetFilename}. Download resumed in aria2c.`,
        });
      } catch (err) {
        const msg = (err as Error).message;
        const existing = this.bindings.get(prompt.targetGid);
        if (existing) {
          existing.state = "error";
          existing.errorMessage = `Refresh failed: ${msg}`;
          await this.saveBindings();
        }
      }
    } else {
      if (suggest) {
        try { suggest(); } catch {}
      }
      try {
        await chrome.downloads.cancel(prompt.browserDownloadId);
        await chrome.downloads.erase({ id: prompt.browserDownloadId });
      } catch {}
    }
    void this.updateBadge();
  }

  public async refreshDownloadUrl(
    gid: string,
    newUrl: string,
    customHeaders?: {
      referer?: string;
      userAgent?: string;
      cookie?: string;
      accept?: string;
      acceptLanguage?: string;
      customHeaders?: string[];
    }
  ): Promise<DownloadBinding> {
    const existing = this.bindings.get(gid);
    if (!existing) {
      throw new Error("Task not found");
    }

    const headers = customHeaders || (await this.collectDownloadHeaders(newUrl, existing.url));
    const baseOptions = resolveAria2Options(
      {
        url: newUrl,
        filename: existing.filename,
      },
      this.settings
    );

    const res = await nativeBridge.refreshDownloadUrl({
      gid,
      newUrl,
      filename: existing.filename,
      directory: existing.directory || this.settings.downloadDirectory || undefined,
      headers,
      options: baseOptions,
    });

    const activeGid = res.newGid || gid;
    existing.url = newUrl;
    existing.state = "aria2-active";
    existing.errorMessage = undefined;
    existing.updatedAt = Date.now();

    if (activeGid !== gid) {
      existing.gid = activeGid;
      this.bindings.delete(gid);
      this.bindings.set(activeGid, existing);
    }

    if (this.awaitingRefresh?.gid === gid) {
      this.cancelAwaitingRefresh();
    }

    await chrome.storage.local.set({
      lastRefreshSuccess: {
        gid: activeGid,
        filename: existing.filename,
        timestamp: Date.now(),
      },
    });

    await this.saveBindings();
    return existing;
  }

  private async loadBindings(): Promise<void> {
    const data = await chrome.storage.local.get(STORAGE_BINDINGS_KEY);
    if (data[STORAGE_BINDINGS_KEY]) {
      const list: DownloadBinding[] = data[STORAGE_BINDINGS_KEY];
      for (const item of list) {
        this.bindings.set(item.gid || `b-${item.browserId}`, item);
      }
    }
  }

  private async saveBindings(): Promise<void> {
    const list = Array.from(this.bindings.values());
    const trimmed = list.slice(-200);
    await chrome.storage.local.set({ [STORAGE_BINDINGS_KEY]: trimmed });
  }

  private setupListeners(): void {
    // 1. Hook initial download creation (for fallback environments)
    chrome.downloads.onCreated.addListener((downloadItem) => {
      // Fallback only if onDeterminingFilename is not supported
      if (!chrome.downloads.onDeterminingFilename) {
        void this.handleDownloadEvent(downloadItem, "onCreated");
      }
    });

    // 2. Hook filename determination: captures real server-resolved filename/MIME
    if (chrome.downloads.onDeterminingFilename) {
      chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
        return this.handleDeterminingFilename(downloadItem, suggest);
      });
    }
  }

  public async triggerManualDownload(url: string, customFilename?: string, refererUrl?: string): Promise<void> {
    if (this.awaitingRefresh) {
      throw new Error("Cannot add new download while waiting to capture refresh link. Please cancel refresh capture first.");
    }
    const filename = customFilename || extractCleanFilename(undefined, url) || "download";
    const ext = getFileExtension(filename, url);
    const subDir = resolveSubDirectory(filename, ext, undefined, this.settings.subDirectoryRouting || []);
    let resolvedDir = this.settings.downloadDirectory || "";
    if (subDir) {
      if (resolvedDir) {
        resolvedDir = resolvedDir.replace(/[/\\]+$/, "") + "/" + subDir;
      } else {
        resolvedDir = subDir;
      }
    }

    const fileCheck = await nativeBridge.checkFileExists(filename, resolvedDir || undefined);

    if (this.settings.mode === "ask" || fileCheck.isCompleted) {
      const syntheticId = Math.floor(Date.now() / 1000);
      this.pendingPrompts.set(syntheticId, {
        id: syntheticId,
        url,
        filename,
        size: 0,
        directory: resolvedDir,
        hasConflict: fileCheck.isCompleted,
      });
      void this.updateBadge();
      try {
        await chrome.action.openPopup();
      } catch {}
      return;
    }

    // In AUTO mode with no conflict: direct add download
    await this.directAddDownload(url, filename, resolvedDir || undefined, undefined, refererUrl);
  }

  private handleDeterminingFilename(
    downloadItem: chrome.downloads.DownloadItem,
    suggest: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void
  ): boolean {
    if (this.handledBrowserIds.has(downloadItem.id)) {
      suggest();
      return false;
    }

    // 0. Awaiting Refresh Interception
    if (this.awaitingRefresh) {
      const target = this.awaitingRefresh;
      const newUrl = downloadItem.finalUrl || downloadItem.url;
      const cleanIncomingName = extractCleanFilename(downloadItem.filename, downloadItem.url, downloadItem.finalUrl) || downloadItem.filename;

      let origDomain = "";
      let newDomain = "";
      try { origDomain = new URL(target.originalUrl).hostname; } catch {}
      try { newDomain = new URL(newUrl).hostname; } catch {}

      const domainsMatch = !origDomain || !newDomain || origDomain === newDomain || origDomain.endsWith("." + newDomain) || newDomain.endsWith("." + origDomain);

      if (!domainsMatch) {
        // Domain mismatch: show warning prompt
        try {
          chrome.downloads.pause(downloadItem.id);
        } catch {
          // ignore
        }
        this.handledBrowserIds.add(downloadItem.id);
        this.pendingSuggests.set(downloadItem.id, suggest);
        this.refreshPrompt = {
          targetGid: target.gid,
          targetFilename: target.filename,
          newUrl,
          newFilename: cleanIncomingName,
          newDomain,
          originalDomain: origDomain,
          browserDownloadId: downloadItem.id,
        };
        void this.updateBadge();
        try {
          chrome.action.openPopup();
        } catch {}
        return true;
      }

      // Domains match: capture and refresh immediately
      this.cancelAwaitingRefresh();
      this.handledBrowserIds.add(downloadItem.id);

      if (suggest) {
        try { suggest(); } catch {}
      }
      try {
        chrome.downloads.cancel(downloadItem.id);
        chrome.downloads.erase({ id: downloadItem.id });
      } catch {}

      void (async () => {
        try {
          const headers = await this.collectDownloadHeaders(newUrl, downloadItem.referrer);
          await this.refreshDownloadUrl(target.gid, newUrl, headers);
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon-48.png",
            title: "Surge — Link Refreshed & Resumed",
            message: `Captured fresh link for ${target.filename}. Download resumed in aria2c.`,
          });
          try {
            await chrome.action.openPopup();
          } catch {}
        } catch (err) {
          const msg = (err as Error).message;
          const existing = this.bindings.get(target.gid);
          if (existing) {
            existing.state = "error";
            existing.errorMessage = `Refresh failed: ${msg}`;
            await this.saveBindings();
          }
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon-48.png",
            title: "Surge — Link Refresh Failed",
            message: `Failed to resume ${target.filename}: ${msg}`,
          });
        }
      })();

      return false;
    }

    const evaluation = evaluateDownloadInterception(
      {
        url: downloadItem.url,
        finalUrl: downloadItem.finalUrl,
        filename: downloadItem.filename,
        mime: downloadItem.mime,
      },
      this.settings
    );

    // 1. OFF or bypassed: retain browser default behavior
    if (!evaluation.shouldIntercept) {
      suggest();
      return false;
    }

    this.handledBrowserIds.add(downloadItem.id);
    this.pendingSuggests.set(downloadItem.id, suggest);

    // 2. ASK Mode: open extension popup automatically from menubar (no new window!), and store prompt
    if (evaluation.requiresPrompt) {
      void (async () => {
        try {
          await chrome.downloads.pause(downloadItem.id);
        } catch {
          // ignore
        }

        const cleanFilename = extractCleanFilename(downloadItem.filename, downloadItem.url, downloadItem.finalUrl);
        const ext = getFileExtension(cleanFilename, downloadItem.url, downloadItem.finalUrl);
        const subDir = resolveSubDirectory(cleanFilename, ext, downloadItem.mime, this.settings.subDirectoryRouting || []);

        let resolvedDir = this.settings.downloadDirectory || "";
        if (subDir) {
          if (resolvedDir) {
            resolvedDir = resolvedDir.replace(/[/\\]+$/, "") + "/" + subDir;
          } else {
            resolvedDir = subDir;
          }
        }

        const targetFilename = cleanFilename || downloadItem.filename || "download";
        const fileCheck = await nativeBridge.checkFileExists(targetFilename, resolvedDir || undefined);

        this.pendingPrompts.set(downloadItem.id, {
          id: downloadItem.id,
          url: downloadItem.finalUrl || downloadItem.url,
          filename: targetFilename,
          size: downloadItem.totalBytes,
          directory: resolvedDir,
          hasConflict: fileCheck.isCompleted,
        });

        void this.updateBadge();

        // Open extension popup automatically from menubar!
        try {
          await chrome.action.openPopup();
        } catch {}
      })();

      return true; // Keep suggest open asynchronously
    }

    // 3. AUTO Mode: check for filename conflict first! If naming conflicts with completed file, ask to rename!
    void (async () => {
      try {
        await chrome.downloads.pause(downloadItem.id);
      } catch {
        // ignore
      }

      const cleanFilename = extractCleanFilename(downloadItem.filename, downloadItem.url, downloadItem.finalUrl);
      const ext = getFileExtension(cleanFilename, downloadItem.url, downloadItem.finalUrl);
      const subDir = resolveSubDirectory(cleanFilename, ext, downloadItem.mime, this.settings.subDirectoryRouting || []);

      let resolvedDir = this.settings.downloadDirectory || "";
      if (subDir) {
        if (resolvedDir) {
          resolvedDir = resolvedDir.replace(/[/\\]+$/, "") + "/" + subDir;
        } else {
          resolvedDir = subDir;
        }
      }

      const targetFilename = cleanFilename || downloadItem.filename || "download";
      const fileCheck = await nativeBridge.checkFileExists(targetFilename, resolvedDir || undefined);

      if (fileCheck.isCompleted) {
        // Naming conflict with completed file! Never overwrite: ask user to rename first
        this.pendingPrompts.set(downloadItem.id, {
          id: downloadItem.id,
          url: downloadItem.finalUrl || downloadItem.url,
          filename: targetFilename,
          size: downloadItem.totalBytes,
          directory: resolvedDir,
          hasConflict: true,
        });

        void this.updateBadge();
        try {
          await chrome.action.openPopup();
        } catch {}
        return;
      }

      // No conflict: offload directly to aria2
      await this.handoffToAria2(downloadItem, undefined, targetFilename, resolvedDir || undefined, suggest);

      // Popup must open automatically in AUTO mode as well!
      try {
        await chrome.action.openPopup();
      } catch {}
    })();

    return true; // Keep suggest open asynchronously until aria2 accepts
  }

  public async handleDownloadEvent(
    downloadItem: chrome.downloads.DownloadItem,
    source: "onCreated" | "onDeterminingFilename"
  ): Promise<void> {
    if (this.handledBrowserIds.has(downloadItem.id)) {
      return;
    }

    // 0. Awaiting Refresh Interception
    if (this.awaitingRefresh) {
      const target = this.awaitingRefresh;
      const newUrl = downloadItem.finalUrl || downloadItem.url;
      const cleanIncomingName = extractCleanFilename(downloadItem.filename, downloadItem.url, downloadItem.finalUrl) || downloadItem.filename;

      let origDomain = "";
      let newDomain = "";
      try { origDomain = new URL(target.originalUrl).hostname; } catch {}
      try { newDomain = new URL(newUrl).hostname; } catch {}

      const domainsMatch = !origDomain || !newDomain || origDomain === newDomain || origDomain.endsWith("." + newDomain) || newDomain.endsWith("." + origDomain);

      if (!domainsMatch) {
        try {
          await chrome.downloads.pause(downloadItem.id);
        } catch {}
        this.handledBrowserIds.add(downloadItem.id);
        this.refreshPrompt = {
          targetGid: target.gid,
          targetFilename: target.filename,
          newUrl,
          newFilename: cleanIncomingName,
          newDomain,
          originalDomain: origDomain,
          browserDownloadId: downloadItem.id,
        };
        void this.updateBadge();
        try {
          await chrome.action.openPopup();
        } catch {}
        return;
      }

      this.cancelAwaitingRefresh();
      this.handledBrowserIds.add(downloadItem.id);
      try {
        await chrome.downloads.cancel(downloadItem.id);
        await chrome.downloads.erase({ id: downloadItem.id });
      } catch {}

      try {
        const headers = await this.collectDownloadHeaders(newUrl, downloadItem.referrer);
        await this.refreshDownloadUrl(target.gid, newUrl, headers);
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-48.png",
          title: "Surge — Link Refreshed & Resumed",
          message: `Captured fresh link for ${target.filename}. Download resumed in aria2c.`,
        });
        try {
          await chrome.action.openPopup();
        } catch {}
      } catch (err) {
        const msg = (err as Error).message;
        const existing = this.bindings.get(target.gid);
        if (existing) {
          existing.state = "error";
          existing.errorMessage = `Refresh failed: ${msg}`;
          await this.saveBindings();
        }
      }
      return;
    }

    const evaluation = evaluateDownloadInterception(
      {
        url: downloadItem.url,
        finalUrl: downloadItem.finalUrl,
        filename: downloadItem.filename,
        mime: downloadItem.mime,
      },
      this.settings
    );

    if (!evaluation.shouldIntercept) {
      return;
    }

    this.handledBrowserIds.add(downloadItem.id);

    const cleanFilename = extractCleanFilename(downloadItem.filename, downloadItem.url, downloadItem.finalUrl);
    const ext = getFileExtension(cleanFilename, downloadItem.url, downloadItem.finalUrl);
    const subDir = resolveSubDirectory(cleanFilename, ext, downloadItem.mime, this.settings.subDirectoryRouting || []);

    let resolvedDir = this.settings.downloadDirectory || "";
    if (subDir) {
      if (resolvedDir) {
        resolvedDir = resolvedDir.replace(/[/\\]+$/, "") + "/" + subDir;
      } else {
        resolvedDir = subDir;
      }
    }

    const targetFilename = cleanFilename || downloadItem.filename || "download";
    const fileCheck = await nativeBridge.checkFileExists(targetFilename, resolvedDir || undefined);

    if (evaluation.requiresPrompt || fileCheck.isCompleted) {
      try {
        await chrome.downloads.pause(downloadItem.id);
      } catch {
        // ignore
      }

      this.pendingPrompts.set(downloadItem.id, {
        id: downloadItem.id,
        url: downloadItem.finalUrl || downloadItem.url,
        filename: targetFilename,
        size: downloadItem.totalBytes,
        directory: resolvedDir,
        hasConflict: fileCheck.isCompleted,
      });

      void this.updateBadge();
      try {
        await chrome.action.openPopup();
      } catch {}
      return;
    }

    await this.handoffToAria2(downloadItem, undefined, targetFilename, resolvedDir || undefined);
    try {
      await chrome.action.openPopup();
    } catch {}
  }

  public async promptUserDecision(
    browserId: number,
    action: "aria2" | "browser" | "cancel",
    customOptions?: Aria2DownloadOptions,
    customFilename?: string,
    customDirectory?: string
  ): Promise<void> {
    const suggest = this.pendingSuggests.get(browserId);
    const promptItem = this.pendingPrompts.get(browserId);
    this.pendingPrompts.delete(browserId);

    void this.updateBadge();

    if (action === "cancel") {
      if (suggest) {
        try {
          suggest();
        } catch {}
        this.pendingSuggests.delete(browserId);
      }
      try {
        await chrome.downloads.cancel(browserId);
        await chrome.downloads.erase({ id: browserId });
      } catch {}
      return;
    }

    const items = await chrome.downloads.search({ id: browserId });
    if (!items || items.length === 0) {
      if (promptItem && action === "aria2") {
        await this.directAddDownload(
          promptItem.url,
          customFilename || promptItem.filename,
          customDirectory || promptItem.directory,
          customOptions
        );
      }
      return;
    }
    const downloadItem = items[0];

    if (action === "browser") {
      if (suggest) {
        suggest(
          customFilename
            ? { filename: customFilename, conflictAction: "uniquify" }
            : undefined
        );
        this.pendingSuggests.delete(browserId);
      }
      try {
        await chrome.downloads.resume(browserId);
      } catch {
        // ignore
      }
      return;
    }

    await this.handoffToAria2(downloadItem, customOptions, customFilename, customDirectory, suggest);
  }

  public getPendingPrompts(): PendingPromptItem[] {
    return Array.from(this.pendingPrompts.values());
  }

  public async selectNativeFolder(browserId?: number, prompt?: string, defaultPath?: string): Promise<SelectFolderResultPayload> {
    const res = await nativeBridge.selectFolder(prompt, defaultPath);
    if (!res.canceled && res.path) {
      if (browserId && this.pendingPrompts.has(browserId)) {
        const item = this.pendingPrompts.get(browserId)!;
        item.directory = res.path;
      } else if (this.pendingPrompts.size > 0) {
        const first = this.pendingPrompts.values().next().value;
        if (first) first.directory = res.path;
      }
      // Re-open popup in case native dialog closed the toolbar popup
      try {
        await chrome.action.openPopup();
      } catch {}
    }
    return res;
  }

  public async downloadInBrowser(url: string, filename?: string): Promise<number> {
    const downloadId = await chrome.downloads.download({
      url,
      filename: filename || undefined,
      saveAs: false,
    });
    // Mark as handled to avoid re-intercepting our own browser retry!
    this.handledBrowserIds.add(downloadId);
    return downloadId;
  }

  public async directAddDownload(
    targetUrl: string,
    customFilename?: string,
    customDirectory?: string,
    customOptions?: Aria2DownloadOptions,
    refererUrl?: string
  ): Promise<{ success: boolean; gid?: string; error?: string }> {
    if (this.awaitingRefresh) {
      return {
        success: false,
        error: "Cannot add new download while waiting to capture refresh link. Please cancel refresh capture first.",
      };
    }
    const cleanName = customFilename || extractCleanFilename(undefined, targetUrl) || "download";
    const targetDir = customDirectory !== undefined ? customDirectory : this.settings.downloadDirectory;

    const ext = getFileExtension(cleanName, targetUrl);
    const subDir = resolveSubDirectory(cleanName, ext, undefined, this.settings.subDirectoryRouting || []);
    let finalTargetDir = targetDir;
    if (subDir && customDirectory === undefined) {
      if (finalTargetDir) {
        finalTargetDir = finalTargetDir.replace(/[/\\]+$/, "") + "/" + subDir;
      } else {
        finalTargetDir = subDir;
      }
    }

    const baseOptions = resolveAria2Options(
      {
        url: targetUrl,
        filename: cleanName,
      },
      this.settings
    );
    const finalOptions: Aria2DownloadOptions = { ...baseOptions, ...customOptions };
    if (customDirectory !== undefined && !customOptions?.subDirectory) {
      delete finalOptions.subDirectory;
    }

    const headers = await this.collectDownloadHeaders(targetUrl, refererUrl);

    try {
      const addResult = await nativeBridge.addDownload({
        url: targetUrl,
        filename: cleanName || undefined,
        directory: finalTargetDir || undefined,
        headers,
        options: finalOptions,
      });

      const gid = addResult.gid;

      const binding: DownloadBinding = {
        browserId: 0,
        gid,
        state: "aria2-active",
        url: targetUrl,
        filename: cleanName || "download",
        totalBytes: 0,
        receivedBytes: 0,
        speed: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        directory: finalTargetDir || undefined,
      };
      this.bindings.set(gid, binding);
      await this.saveBindings();

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-48.png",
        title: "Surge — Download Started",
        message: `${cleanName || targetUrl} is downloading in aria2c.`,
      });

      try {
        await chrome.action.openPopup();
      } catch {}

      return { success: true, gid };
    } catch (err) {
      const msg = (err as Error).message;
      console.error("[aria2] Direct download failed", msg);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-48.png",
        title: "Surge — Download Failed",
        message: `Error: ${msg}`,
      });
      return { success: false, error: msg };
    }
  }

  private async collectDownloadHeaders(targetUrl: string, refererUrl?: string): Promise<{
    referer?: string;
    userAgent?: string;
    cookie?: string;
    accept?: string;
    acceptLanguage?: string;
    customHeaders?: string[];
  }> {
    let cookieHeader: string | undefined;
    if (this.settings.forwardCookies) {
      const urls = [targetUrl, refererUrl].filter(Boolean) as string[];
      const cookieMap = new Map<string, string>();

      for (const u of urls) {
        try {
          const cookies = await chrome.cookies.getAll({ url: u });
          for (const c of cookies) {
            cookieMap.set(c.name, c.value);
          }
        } catch {}

        try {
          const host = new URL(u).hostname;
          const domainCookies = await chrome.cookies.getAll({ domain: host });
          for (const c of domainCookies) {
            cookieMap.set(c.name, c.value);
          }
          const parts = host.split(".");
          if (parts.length > 2) {
            const rootDomain = parts.slice(-2).join(".");
            const rootCookies = await chrome.cookies.getAll({ domain: rootDomain });
            for (const c of rootCookies) {
              cookieMap.set(c.name, c.value);
            }
          }
        } catch {}
      }

      if (cookieMap.size > 0) {
        cookieHeader = Array.from(cookieMap.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
      }
    }

    const defaultReferer = refererUrl || (() => {
      try {
        return new URL(targetUrl).origin + "/";
      } catch {
        return undefined;
      }
    })();

    const headers: {
      referer?: string;
      userAgent?: string;
      cookie?: string;
      accept?: string;
      acceptLanguage?: string;
      customHeaders?: string[];
    } = {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      acceptLanguage: navigator.language ? `${navigator.language},en;q=0.9` : "en-US,en;q=0.9",
      customHeaders: [
        "Sec-Fetch-Dest: document",
        "Sec-Fetch-Mode: navigate",
        "Sec-Fetch-Site: same-origin",
        "Sec-Fetch-User: ?1",
        "Upgrade-Insecure-Requests: 1",
      ],
    };

    if (this.settings.forwardUserAgent) {
      headers.userAgent = navigator.userAgent;
    }
    if (this.settings.forwardReferer && defaultReferer) {
      headers.referer = defaultReferer;
    }
    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }

    return headers;
  }

  private async handoffToAria2(
    downloadItem: chrome.downloads.DownloadItem,
    customOptions?: Aria2DownloadOptions,
    customFilename?: string,
    customDirectory?: string,
    fallbackSuggest?: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void
  ): Promise<void> {
    const targetUrl = downloadItem.finalUrl || downloadItem.url;
    // Prefer explicitly chosen filename from user, otherwise server-determined filename
    const cleanName = customFilename || extractCleanFilename(downloadItem.filename, downloadItem.url, downloadItem.finalUrl);
    const targetDir = customDirectory !== undefined ? customDirectory : this.settings.downloadDirectory;

    // 1. Pre-emptively pause browser download so it does not waste bandwidth
    try {
      await chrome.downloads.pause(downloadItem.id);
    } catch {
      // ignore
    }

    const initialBinding: DownloadBinding = {
      browserId: downloadItem.id,
      gid: "",
      state: "handoff-pending",
      url: targetUrl,
      filename: cleanName || "download",
      totalBytes: downloadItem.totalBytes > 0 ? downloadItem.totalBytes : 0,
      receivedBytes: 0,
      speed: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      directory: targetDir || undefined,
    };

    const tempKey = `b-${downloadItem.id}`;
    this.bindings.set(tempKey, initialBinding);
    await this.saveBindings();

    // 2. Resolve Aria2 options from rules engine + custom overrides
    const baseOptions = resolveAria2Options(
      {
        url: downloadItem.url,
        finalUrl: downloadItem.finalUrl,
        filename: cleanName || downloadItem.filename,
        mime: downloadItem.mime,
      },
      this.settings
    );
    const finalOptions: Aria2DownloadOptions = { ...baseOptions, ...customOptions };
    if (customDirectory !== undefined) {
      if (!customOptions?.subDirectory) {
        delete finalOptions.subDirectory;
      }
    }

    const headers = await this.collectDownloadHeaders(targetUrl, downloadItem.referrer);

    try {
      // 3. Dispatch to Native Host
      const addResult = await nativeBridge.addDownload({
        url: targetUrl,
        filename: cleanName || undefined,
        directory: targetDir || undefined,
        headers,
        options: finalOptions,
      });

      const gid = addResult.gid;

      initialBinding.gid = gid;
      initialBinding.state = "aria2-added";
      initialBinding.filename = cleanName || initialBinding.filename;
      initialBinding.updatedAt = Date.now();

      this.bindings.delete(tempKey);
      this.bindings.set(gid, initialBinding);

      // 4. Now and ONLY now: cancel and erase the browser download
      initialBinding.state = "browser-cancel-pending";
      try {
        await chrome.downloads.cancel(downloadItem.id);
        await chrome.downloads.erase({ id: downloadItem.id });
      } catch (cancelErr) {
        console.warn("[interceptor] Browser cancel error", cancelErr);
      }

      this.pendingSuggests.delete(downloadItem.id);

      initialBinding.state = "aria2-active";
      initialBinding.updatedAt = Date.now();
      await this.saveBindings();

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-48.png",
        title: "Surge — Download Offloaded",
        message: `${cleanName || targetUrl} is downloading in aria2c.`,
      });
    } catch (err) {
      const errorMessage = (err as Error).message;
      console.error("[interceptor] Aria2 handoff failed, resuming browser download", errorMessage);

      initialBinding.state = "browser-active";
      initialBinding.errorMessage = errorMessage;
      initialBinding.updatedAt = Date.now();
      await this.saveBindings();

      // Resolve pending suggestion so browser download is unblocked
      if (fallbackSuggest) {
        fallbackSuggest({
          filename: cleanName || downloadItem.filename,
          conflictAction: "uniquify",
        });
        this.pendingSuggests.delete(downloadItem.id);
      }

      // Resume browser download so file is NOT lost!
      try {
        await chrome.downloads.resume(downloadItem.id);
      } catch {
        // ignore
      }

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-48.png",
        title: "Surge — Handoff Failed (Browser Download Retained)",
        message: `Download continues in browser. Error: ${errorMessage}`,
      });
    }
  }

  private handleAria2Progress(progress: DownloadProgressPayload): void {
    const existing = this.bindings.get(progress.gid);
    const now = Date.now();

    if (existing) {
      existing.receivedBytes = progress.completedBytes > 0 ? progress.completedBytes : existing.receivedBytes;
      existing.totalBytes = progress.totalBytes > 0 ? progress.totalBytes : existing.totalBytes;
      existing.speed = progress.downloadSpeed;
      existing.updatedAt = now;

      if (progress.status === "complete") {
        existing.receivedBytes = existing.totalBytes > 0 ? existing.totalBytes : (progress.completedBytes > 0 ? progress.completedBytes : existing.receivedBytes);
        existing.totalBytes = existing.totalBytes > 0 ? existing.totalBytes : existing.receivedBytes;
        existing.speed = 0;
        existing.state = "completed";
      } else if (progress.status === "error") {
        existing.state = "failed";
        existing.errorMessage = progress.errorMessage;
        console.error(`[aria2] Download error for GID=${progress.gid}`, progress.errorMessage);
      } else if (progress.status === "paused" || progress.status === "waiting") {
        existing.state = "paused";
        existing.speed = 0;
      } else if (progress.status === "removed") {
        existing.state = "cancelled";
      } else {
        existing.state = "aria2-active";
      }
    } else {
      let initState: DownloadBinding["state"] = "aria2-active";
      if (progress.status === "complete") initState = "completed";
      else if (progress.status === "paused" || progress.status === "waiting") initState = "paused";
      else if (progress.status === "error") initState = "failed";
      else if (progress.status === "removed") initState = "cancelled";

      const newBinding: DownloadBinding = {
        browserId: 0,
        gid: progress.gid,
        state: initState,
        url: "",
        filename: `aria2-task-${progress.gid.slice(0, 6)}`,
        totalBytes: progress.totalBytes,
        receivedBytes: progress.completedBytes,
        speed: progress.downloadSpeed,
        createdAt: now,
        updatedAt: now,
        errorMessage: progress.errorMessage,
      };
      this.bindings.set(progress.gid, newBinding);
    }

    void this.saveBindings();
  }
}

export const downloadInterceptor = new DownloadInterceptor();
