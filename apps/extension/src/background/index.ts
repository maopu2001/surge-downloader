import { downloadInterceptor } from "./download-interceptor.js";
import { nativeBridge } from "./native-bridge.js";

async function startup(): Promise<void> {
  await downloadInterceptor.initialize();

  // Try to sync with native host on wake up
  try {
    await nativeBridge.syncDownloads();
  } catch {
    // Native host may not be running yet until requested
  }
}

void startup();

chrome.runtime.onInstalled.addListener(() => {
  void startup();
});

chrome.runtime.onStartup.addListener(() => {
  void startup();
});

// Message listener for popup, dashboard, options, and prompt
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, payload } = message || {};

  switch (type) {
    case "GET_SETTINGS": {
      sendResponse({ success: true, data: downloadInterceptor.getSettings() });
      return false;
    }

    case "UPDATE_SETTINGS": {
      downloadInterceptor
        .updateSettings(payload)
        .then((updated) => sendResponse({ success: true, data: updated }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "GET_DOWNLOADS": {
      downloadInterceptor
        .verifyFilesIntegrity()
        .then((data) => sendResponse({ success: true, data }))
        .catch(() => sendResponse({ success: true, data: downloadInterceptor.getBindings() }));
      return true;
    }

    case "RESTART_DOWNLOAD": {
      downloadInterceptor
        .restartDownload(payload.gid)
        .then((res) => sendResponse({ success: true, data: res }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "PAUSE_DOWNLOAD": {
      downloadInterceptor
        .pauseDownload(payload.gid)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "RESUME_DOWNLOAD": {
      downloadInterceptor
        .resumeDownload(payload.gid)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "CANCEL_DOWNLOAD": {
      downloadInterceptor
        .cancelDownload(payload.gid)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "REMOVE_DOWNLOAD": {
      downloadInterceptor
        .removeBinding(payload.gid, payload.deleteFile)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "CLEAR_FINISHED_DOWNLOADS": {
      downloadInterceptor
        .clearFinishedBindings(payload?.deleteFiles)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "PAUSE_ALL_DOWNLOADS": {
      downloadInterceptor
        .pauseAll()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "RESUME_ALL_DOWNLOADS": {
      downloadInterceptor
        .resumeAll()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "REFRESH_DOWNLOAD_URL": {
      downloadInterceptor
        .refreshDownloadUrl(payload.gid, payload.newUrl)
        .then((updated) => sendResponse({ success: true, data: updated }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "DOWNLOAD_IN_BROWSER": {
      downloadInterceptor
        .downloadInBrowser(payload.url, payload.filename)
        .then((id) => sendResponse({ success: true, downloadId: id }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "OPEN_IN_FOLDER": {
      downloadInterceptor
        .openFolder(payload?.gid, payload?.filename)
        .then((res) => sendResponse({ success: true, data: res }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "SYNC_DOWNLOADS": {
      nativeBridge
        .syncDownloads()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "TEST_CONNECTION": {
      (async () => {
        const results: Record<string, { ok: boolean; message: string }> = {
          sw: { ok: true, message: "Service worker active" },
          nativeHost: { ok: false, message: "Disconnected" },
          aria2c: { ok: false, message: "Not checked" },
        };

        try {
          const t0 = Date.now();
          await nativeBridge.ping();
          const latency = Date.now() - t0;
          results.nativeHost = { ok: true, message: `Ping/Pong latency: ${latency}ms` };

          const aria = await nativeBridge.getAria2Status();
          results.aria2c = {
            ok: true,
            message: `aria2c v${aria.version} connected on port ${aria.port}`,
          };
        } catch (err) {
          results.nativeHost = { ok: false, message: (err as Error).message };
        }

        return results;
      })()
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "PROMPT_DECISION": {
      downloadInterceptor
        .promptUserDecision(
          payload.browserId,
          payload.action,
          payload.options,
          payload.filename,
          payload.directory
        )
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "GET_PENDING_PROMPTS": {
      sendResponse({ success: true, data: downloadInterceptor.getPendingPrompts() });
      return false;
    }

    case "SELECT_FOLDER": {
      downloadInterceptor
        .selectNativeFolder(payload?.browserId, payload?.prompt, payload?.defaultPath)
        .then((res) => sendResponse({ success: true, data: res }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "CHECK_FILE_CONFLICT": {
      nativeBridge
        .checkFileExists(payload.filename, payload.directory)
        .then((res) => sendResponse({ success: true, data: res }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    default:
      sendResponse({ success: false, error: `Unknown message type: ${type}` });
      return false;
  }
});
