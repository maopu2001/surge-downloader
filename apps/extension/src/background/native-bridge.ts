import {
  createEnvelope,
  type ProtocolEnvelope,
  type DownloadAddPayload,
  type DownloadAddedPayload,
  type DownloadProgressPayload,
  type DownloadRefreshUrlPayload,
  type SelectFolderResultPayload,
  type CheckFileExistsResult,
  type Aria2ReadyPayload,
  type ErrorPayload,
  type CheckFilesStatusItem,
  type FileStatusResultItem,
  type FilesStatusResultPayload,
} from "@aria2-browser/protocol";

export const HOST_NAME = "com.aria2.browser.host";

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: NodeJS.Timeout;
}

export type ProgressCallback = (progress: DownloadProgressPayload) => void;
export type StatusCallback = (connected: boolean, error?: string) => void;

export class NativeBridge {
  private port: chrome.runtime.Port | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private progressListeners = new Set<ProgressCallback>();
  private statusListeners = new Set<StatusCallback>();
  private isConnecting = false;

  constructor() {}

  public onProgress(cb: ProgressCallback): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  public onStatus(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  public isConnected(): boolean {
    return this.port !== null;
  }

  public ensureConnected(): chrome.runtime.Port {
    if (this.port) {
      return this.port;
    }

    try {
      this.isConnecting = true;
      const port = chrome.runtime.connectNative(HOST_NAME);

      port.onMessage.addListener((message: ProtocolEnvelope<any>) => {
        this.handleIncomingMessage(message);
      });

      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError?.message || "Native host disconnected";
        this.handleDisconnect(error);
      });

      this.port = port;
      this.isConnecting = false;
      this.notifyStatus(true);
      return port;
    } catch (err) {
      this.isConnecting = false;
      const msg = (err as Error).message;
      this.notifyStatus(false, msg);
      throw err;
    }
  }

  private handleDisconnect(error: string): void {
    this.port = null;
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(`Native host disconnected: ${error}`));
      this.pendingRequests.delete(id);
    }
    this.notifyStatus(false, error);
  }

  private notifyStatus(connected: boolean, error?: string): void {
    for (const listener of this.statusListeners) {
      listener(connected, error);
    }
  }

  private handleIncomingMessage(msg: ProtocolEnvelope<any>): void {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "download.progress") {
      const payload = msg.payload as DownloadProgressPayload;
      for (const listener of this.progressListeners) {
        listener(payload);
      }
    }

    if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
      const req = this.pendingRequests.get(msg.requestId)!;
      clearTimeout(req.timer);
      this.pendingRequests.delete(msg.requestId);

      if (msg.type === "error") {
        const errPayload = msg.payload as ErrorPayload;
        req.reject(new Error(`[${errPayload.code}] ${errPayload.message}`));
      } else {
        req.resolve(msg.payload);
      }
    }
  }

  public sendRequest<TResponse>(
    type: string,
    payload: unknown = {},
    timeoutMs = 10000
  ): Promise<TResponse> {
    const port = this.ensureConnected();
    const requestId = crypto.randomUUID();
    const envelope = createEnvelope(type, payload, requestId);

    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${type} (id: ${requestId}) timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      try {
        port.postMessage(envelope);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(err);
      }
    });
  }

  public async ping(): Promise<number> {
    const res = await this.sendRequest<{ timestamp: number }>("ping", {});
    return res.timestamp;
  }

  public async getAria2Status(): Promise<Aria2ReadyPayload> {
    return this.sendRequest<Aria2ReadyPayload>("aria2.status", {});
  }

  public async addDownload(payload: DownloadAddPayload): Promise<DownloadAddedPayload> {
    return this.sendRequest<DownloadAddedPayload>("download.add", payload, 15000);
  }

  public async pauseDownload(gid: string): Promise<void> {
    await this.sendRequest("download.pause", { gid });
  }

  public async resumeDownload(gid: string): Promise<void> {
    await this.sendRequest("download.resume", { gid });
  }

  public async cancelDownload(gid: string): Promise<void> {
    await this.sendRequest("download.cancel", { gid });
  }

  public async removeDownload(
    gid: string,
    opts: { filename?: string; directory?: string; deleteFile?: boolean; isCompleted?: boolean } = {}
  ): Promise<{ fileDeleted?: boolean }> {
    return this.sendRequest("download.remove", { gid, ...opts });
  }

  public async refreshDownloadUrl(
    payload: DownloadRefreshUrlPayload
  ): Promise<{ oldGid: string; newGid?: string; url: string }> {
    return this.sendRequest("download.refreshUrl", payload);
  }

  public async openFolder(payload: {
    gid?: string;
    directory?: string;
    filename?: string;
  }): Promise<{ success: boolean; path?: string }> {
    return this.sendRequest("download.openFolder", payload);
  }

  public async checkFileExists(filename: string, directory?: string): Promise<CheckFileExistsResult> {
    try {
      return await this.sendRequest<CheckFileExistsResult>("file.checkExists", { filename, directory }, 5000);
    } catch {
      return { exists: false, path: "", isCompleted: false };
    }
  }

  public async checkFilesStatus(items: CheckFilesStatusItem[]): Promise<FileStatusResultItem[]> {
    if (!items || items.length === 0) return [];
    try {
      const res = await this.sendRequest<FilesStatusResultPayload>(
        "download.checkFilesStatus",
        { items },
        10000
      );
      return res?.results || [];
    } catch {
      return [];
    }
  }

  public async selectFolder(prompt?: string, defaultPath?: string): Promise<SelectFolderResultPayload> {
    return this.sendRequest<SelectFolderResultPayload>("dialog.selectFolder", { prompt, defaultPath }, 120000);
  }

  public async pauseAllDownloads(): Promise<void> {
    await this.sendRequest("download.pauseAll", {});
  }

  public async resumeAllDownloads(): Promise<void> {
    await this.sendRequest("download.resumeAll", {});
  }

  public async syncDownloads(): Promise<{ activeGids: string[] }> {
    return await this.sendRequest<{ activeGids: string[] }>("download.sync", {});
  }

  public disconnect(): void {
    if (this.port) {
      try {
        this.port.disconnect();
      } catch {
        // ignore
      }
      this.port = null;
    }
  }
}

export const nativeBridge = new NativeBridge();
