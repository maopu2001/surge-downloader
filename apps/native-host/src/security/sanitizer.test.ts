import { describe, it, expect } from "vitest";
import {
  validateUrl,
  sanitizeFilename,
  sanitizeDirectory,
  sanitizeSubDirectory,
  validateProxy,
  resolveUniqueFilename,
} from "./sanitizer.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Security Sanitizer", () => {
  describe("validateUrl", () => {
    it("allows valid http and https URLs", () => {
      expect(validateUrl("https://example.com/file.zip").valid).toBe(true);
      expect(validateUrl("http://example.com/image.iso").valid).toBe(true);
    });

    it("rejects forbidden schemes (blob, data, chrome)", () => {
      expect(validateUrl("blob:https://example.com/uuid").valid).toBe(false);
      expect(validateUrl("data:text/plain;base64,abc").valid).toBe(false);
      expect(validateUrl("chrome://settings").valid).toBe(false);
      expect(validateUrl("file:///etc/passwd").valid).toBe(false);
    });
  });

  describe("sanitizeFilename", () => {
    it("strips path separators and reserved characters", () => {
      const res = sanitizeFilename("../../evil/file:name?.txt");
      expect(res.valid).toBe(true);
      expect(res.sanitizedFilename).toBe(".._.._evil_file_name_.txt");
      expect(res.sanitizedFilename).not.toContain("/");
      expect(res.sanitizedFilename).not.toContain("\\");
    });

    it("prefixes windows reserved filenames", () => {
      const res = sanitizeFilename("CON.txt");
      expect(res.valid).toBe(true);
      expect(res.sanitizedFilename).toBe("_CON.txt");
    });

    it("rejects excessively long filenames", () => {
      const longName = "a".repeat(300);
      const res = sanitizeFilename(longName);
      expect(res.valid).toBe(false);
    });
  });

  describe("sanitizeDirectory", () => {
    it("rejects directory traversal attempts", () => {
      const res = sanitizeDirectory("../../../etc");
      expect(res.valid).toBe(false);
      expect(res.error).toContain("relative traversal");
    });

    it("accepts valid absolute paths", () => {
      const res = sanitizeDirectory("/tmp/downloads");
      expect(res.valid).toBe(true);
      expect(res.sanitizedPath).toBe("/tmp/downloads");
    });
  });

  describe("sanitizeSubDirectory", () => {
    const base = "/tmp/downloads";

    it("accepts valid subdirectories and joins safely", () => {
      const res = sanitizeSubDirectory(base, "ISOs/Linux");
      expect(res.valid).toBe(true);
      expect(res.sanitizedPath).toBe("/tmp/downloads/ISOs/Linux");
    });

    it("rejects traversal escaping base directory", () => {
      const res = sanitizeSubDirectory(base, "../evil");
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("returns base directory when subDirectory is empty", () => {
      const res = sanitizeSubDirectory(base, "");
      expect(res.valid).toBe(true);
      expect(res.sanitizedPath).toBe(base);
    });
  });

  describe("validateProxy", () => {
    it("allows valid http, https, and socks5 proxies", () => {
      expect(validateProxy("socks5://127.0.0.1:1080").valid).toBe(true);
      expect(validateProxy("http://127.0.0.1:8080").valid).toBe(true);
      expect(validateProxy("").valid).toBe(true);
      expect(validateProxy(undefined).valid).toBe(true);
    });

    it("rejects invalid schemes or malformed proxies", () => {
      expect(validateProxy("file:///etc/passwd").valid).toBe(false);
      expect(validateProxy("not-a-url").valid).toBe(false);
    });
  });

  describe("resolveUniqueFilename", () => {
    it("keeps filename if file does not exist", () => {
      const dir = os.tmpdir();
      const unique = resolveUniqueFilename(dir, "non-existent-file-12345.iso");
      expect(unique).toBe("non-existent-file-12345.iso");
    });

    it("generates (1) suffix if file already exists on disk without .aria2 file", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aria-dup-test-"));
      const originalFile = path.join(tmpDir, "document.pdf");
      fs.writeFileSync(originalFile, "existing content");

      const unique = resolveUniqueFilename(tmpDir, "document.pdf");
      expect(unique).toBe("document (1).pdf");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});
