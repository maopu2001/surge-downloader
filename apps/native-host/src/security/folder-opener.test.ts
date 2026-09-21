import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { resolveSafeTarget } from "./folder-opener.js";

describe("Folder Opener - resolveSafeTarget", () => {
  it("resolves existing file correctly", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-test-"));
    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "sample");

    const target = resolveSafeTarget(tmpDir, "test.txt");
    expect(target.isDirectory).toBe(false);
    expect(target.targetPath).toBe(filePath);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("falls back to directory if file does not exist", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-test-"));

    const target = resolveSafeTarget(tmpDir, "non-existent.bin");
    expect(target.isDirectory).toBe(true);
    expect(target.targetPath).toBe(tmpDir);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("falls back to default OS downloads if directory is invalid", () => {
    const target = resolveSafeTarget("../../invalid-traversal", "test.bin");
    expect(target.isDirectory).toBe(true);
    expect(target.targetPath).toBe(path.join(os.homedir(), "Downloads"));
  });
});
