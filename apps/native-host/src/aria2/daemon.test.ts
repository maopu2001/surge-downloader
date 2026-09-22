import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultSessionPath, Aria2DaemonManager } from "./daemon.js";

describe("Aria2DaemonManager & Session Management", () => {
  it("creates and returns session path in specified directory", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "aria-session-test-"));
    const sessionPath = getDefaultSessionPath(tmpBase);
    expect(typeof sessionPath).toBe("string");
    expect(sessionPath.endsWith("session.txt")).toBe(true);
    expect(fs.existsSync(sessionPath)).toBe(true);
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("creates and returns default session path safely", () => {
    const sessionPath = getDefaultSessionPath();
    expect(typeof sessionPath).toBe("string");
    expect(sessionPath.endsWith("session.txt")).toBe(true);
    expect(fs.existsSync(sessionPath)).toBe(true);
  });

  it("initializes Aria2DaemonManager with custom session and token", () => {
    const manager = new Aria2DaemonManager({
      port: 6899,
      secretToken: "custom-secret-token",
      sessionPath: "/tmp/custom-session.txt",
    });

    expect(manager.getPort()).toBe(6899);
    expect(manager.getSecretToken()).toBe("custom-secret-token");
    expect(manager.getClient()).toBeDefined();
  });
});
