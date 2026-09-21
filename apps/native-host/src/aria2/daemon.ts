import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { Aria2RpcClient } from "./client.js";

export interface Aria2DaemonOptions {
  port?: number;
  secretToken?: string;
  executablePath?: string;
}

export class Aria2DaemonManager {
  private childProcess: ChildProcess | null = null;
  private secretToken: string;
  private port: number;
  private client: Aria2RpcClient;
  private spawnedByUs = false;

  constructor(options: Aria2DaemonOptions = {}) {
    this.port = options.port || 6800;
    this.secretToken = options.secretToken || crypto.randomBytes(32).toString("hex");
    this.client = new Aria2RpcClient(this.port, this.secretToken);
  }

  public getClient(): Aria2RpcClient {
    return this.client;
  }

  public getPort(): number {
    return this.port;
  }

  public getSecretToken(): string {
    return this.secretToken;
  }

  public async ensureRunning(executable = "aria2c"): Promise<{ version: string; port: number }> {
    // 1. Check if an instance is already running with our configured token
    try {
      const existingVersion = await this.client.getVersion();
      return { version: existingVersion.version, port: this.port };
    } catch {
      // Failed with token
    }

    // 2. Check if an existing instance is running without any secret token
    try {
      const noAuthClient = new Aria2RpcClient(this.port, "");
      const noAuthVer = await noAuthClient.getVersion();
      // Adopt empty secret token
      this.secretToken = "";
      this.client = noAuthClient;
      return { version: noAuthVer.version, port: this.port };
    } catch {
      // Not running without secret either
    }

    // 3. Attempt to spawn our managed aria2c daemon (trying ports from current up to +5)
    let lastError: Error | null = null;
    const basePort = this.port;

    for (let p = basePort; p < basePort + 5; p++) {
      try {
        const info = await this.spawnDaemonOnPort(p, executable);
        this.port = p;
        this.client.setPort(p);
        this.client.setSecretToken(this.secretToken);
        return info;
      } catch (err) {
        lastError = err as Error;
        if ((err as Error).message.includes("Address already in use")) {
          // Port collision, try next port
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error("Failed to start aria2c daemon");
  }

  private spawnDaemonOnPort(
    port: number,
    executable: string
  ): Promise<{ version: string; port: number }> {
    if (!this.secretToken) {
      this.secretToken = crypto.randomBytes(32).toString("hex");
      this.client.setSecretToken(this.secretToken);
    }

    const args = [
      "--enable-rpc=true",
      "--rpc-listen-all=false",
      `--rpc-listen-port=${port}`,
      `--rpc-secret=${this.secretToken}`,
      "--rpc-max-request-size=10M",
      "--allow-overwrite=false",
      "--auto-file-renaming=true",
      "--conditional-get=true",
    ];

    const extendedPath = [
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      process.env.PATH,
    ]
      .filter(Boolean)
      .join(process.platform === "win32" ? ";" : ":");

    return new Promise((resolve, reject) => {
      try {
        const proc = spawn(executable, args, {
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
          env: {
            ...process.env,
            PATH: extendedPath,
          },
        });

        this.childProcess = proc;
        this.spawnedByUs = true;

        let stderrOutput = "";
        proc.stderr?.on("data", (chunk: Buffer) => {
          stderrOutput += chunk.toString("utf8");
        });

        proc.on("error", (err) => {
          reject(new Error(`Failed to spawn aria2c: ${err.message}`));
        });

        proc.on("exit", (code, signal) => {
          this.childProcess = null;
          const cleanErr = stderrOutput.trim() || `exit code: ${code}, signal: ${signal}`;
          reject(new Error(`aria2c exited (${cleanErr})`));
        });

        const startTime = Date.now();
        const timeoutMs = 4000;
        const testClient = new Aria2RpcClient(port, this.secretToken);

        const checkReadiness = async () => {
          if (Date.now() - startTime > timeoutMs) {
            this.stop();
            reject(new Error(`Timeout waiting for aria2c RPC on port ${port}`));
            return;
          }

          try {
            const ver = await testClient.getVersion();
            resolve({ version: ver.version, port });
          } catch {
            setTimeout(checkReadiness, 150);
          }
        };

        setTimeout(checkReadiness, 100);
      } catch (err) {
        reject(err);
      }
    });
  }

  public stop(): void {
    if (this.childProcess && this.spawnedByUs) {
      try {
        this.childProcess.kill("SIGTERM");
      } catch {
        // Ignore kill errors
      }
      this.childProcess = null;
      this.spawnedByUs = false;
    }
  }
}
