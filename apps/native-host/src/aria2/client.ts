export interface Aria2DownloadStatus {
  gid: string;
  status: "active" | "waiting" | "paused" | "error" | "complete" | "removed";
  totalLength: string;
  completedLength: string;
  downloadSpeed: string;
  uploadSpeed: string;
  errorCode?: string;
  errorMessage?: string;
  dir?: string;
  files?: Array<{
    path: string;
    completedLength: string;
    length: string;
    selected: string;
    uris: Array<{ uri: string; status: string }>;
  }>;
}

export interface Aria2VersionResult {
  version: string;
  enabledFeatures: string[];
}

export class Aria2RpcClient {
  private rpcUrl: string;
  private secretToken: string;
  private idCounter = 1;

  constructor(port = 6800, secretToken = "") {
    this.rpcUrl = `http://127.0.0.1:${port}/jsonrpc`;
    this.secretToken = secretToken;
  }

  public setSecretToken(token: string): void {
    this.secretToken = token;
  }

  public setPort(port: number): void {
    this.rpcUrl = `http://127.0.0.1:${port}/jsonrpc`;
  }

  private async callRpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const authParams: unknown[] = this.secretToken
      ? [`token:${this.secretToken}`, ...params]
      : params;

    const body = {
      jsonrpc: "2.0",
      id: `rpc-${this.idCounter++}`,
      method,
      params: authParams,
    };

    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Aria2 RPC HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      jsonrpc: string;
      id: string;
      result?: T;
      error?: { code: number; message: string };
    };

    if (data.error) {
      throw new Error(`Aria2 RPC Error (${data.error.code}): ${data.error.message}`);
    }

    return data.result as T;
  }

  public async getVersion(): Promise<Aria2VersionResult> {
    return this.callRpc<Aria2VersionResult>("aria2.getVersion");
  }

  public async addUri(
    uris: string[],
    options: Record<string, string | string[]> = {}
  ): Promise<string> {
    return this.callRpc<string>("aria2.addUri", [uris, options]);
  }

  public async pause(gid: string): Promise<string> {
    try {
      return await this.callRpc<string>("aria2.pause", [gid]);
    } catch {
      return await this.callRpc<string>("aria2.forcePause", [gid]);
    }
  }

  public async unpause(gid: string): Promise<string> {
    return this.callRpc<string>("aria2.unpause", [gid]);
  }

  public async changeUri(
    gid: string,
    fileIndex = 1,
    delUris: string[] = [],
    addUris: string[] = []
  ): Promise<[number, number]> {
    return this.callRpc<[number, number]>("aria2.changeUri", [
      gid,
      fileIndex,
      delUris,
      addUris,
    ]);
  }

  public async remove(gid: string): Promise<string> {
    try {
      return await this.callRpc<string>("aria2.remove", [gid]);
    } catch {
      // Fallback to forceRemove if active or stuck
      try {
        return await this.callRpc<string>("aria2.forceRemove", [gid]);
      } catch {
        return await this.removeDownloadResult(gid);
      }
    }
  }

  public async removeDownloadResult(gid: string): Promise<string> {
    try {
      return await this.callRpc<string>("aria2.removeDownloadResult", [gid]);
    } catch {
      return gid;
    }
  }

  public async purgeDownloadResult(): Promise<string> {
    try {
      return await this.callRpc<string>("aria2.purgeDownloadResult");
    } catch {
      return "OK";
    }
  }

  public async pauseAll(): Promise<string> {
    return this.callRpc<string>("aria2.pauseAll");
  }

  public async unpauseAll(): Promise<string> {
    return this.callRpc<string>("aria2.unpauseAll");
  }

  public async tellStatus(gid: string): Promise<Aria2DownloadStatus> {
    return this.callRpc<Aria2DownloadStatus>("aria2.tellStatus", [gid]);
  }

  public async tellActive(): Promise<Aria2DownloadStatus[]> {
    return this.callRpc<Aria2DownloadStatus[]>("aria2.tellActive");
  }

  public async tellWaiting(offset = 0, num = 100): Promise<Aria2DownloadStatus[]> {
    return this.callRpc<Aria2DownloadStatus[]>("aria2.tellWaiting", [offset, num]);
  }

  public async tellStopped(offset = 0, num = 100): Promise<Aria2DownloadStatus[]> {
    return this.callRpc<Aria2DownloadStatus[]>("aria2.tellStopped", [offset, num]);
  }
}
