import { describe, it, expect } from "vitest";
import {
  evaluateDownloadInterception,
  extractCleanFilename,
  getFileExtension,
  extractChecksumFromUrl,
  resolveSubDirectory,
  resolveAria2Options,
} from "./rules-engine.js";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "@aria2-browser/protocol";

describe("Interception Rules Engine", () => {
  const baseSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };

  it("ignores downloads when mode is OFF", () => {
    const res = evaluateDownloadInterception(
      { url: "https://example.com/file.zip", filename: "file.zip" },
      { ...baseSettings, mode: "off" }
    );
    expect(res.shouldIntercept).toBe(false);
    expect(res.reason).toContain("Mode is OFF");
  });

  it("ignores restricted protocols (blob, data, chrome)", () => {
    const res = evaluateDownloadInterception(
      { url: "blob:https://example.com/uuid-1234", filename: "file.zip" },
      baseSettings
    );
    expect(res.shouldIntercept).toBe(false);
    expect(res.reason).toContain("Restricted protocol");
  });

  it("respects domain exclusion", () => {
    const res = evaluateDownloadInterception(
      { url: "https://corp.internal.net/archive.zip", filename: "archive.zip" },
      { ...baseSettings, excludedDomains: ["*.internal.net"] }
    );
    expect(res.shouldIntercept).toBe(false);
    expect(res.reason).toContain("Domain excluded");
  });

  it("respects extension exclusion over extension inclusion", () => {
    const res = evaluateDownloadInterception(
      { url: "https://example.com/document.pdf", filename: "document.pdf" },
      { ...baseSettings, excludedExtensions: ["pdf"], includedExtensions: ["pdf", "zip"] }
    );
    expect(res.shouldIntercept).toBe(false);
    expect(res.reason).toContain("Extension excluded");
  });

  it("intercepts PDF and general documents by default", () => {
    const res = evaluateDownloadInterception(
      { url: "https://example.com/document.pdf", filename: "document.pdf" },
      baseSettings
    );
    expect(res.shouldIntercept).toBe(true);
  });

  it("intercepts matching included extension in AUTO mode", () => {
    const res = evaluateDownloadInterception(
      { url: "https://example.com/os.iso", filename: "os.iso" },
      baseSettings
    );
    expect(res.shouldIntercept).toBe(true);
    expect(res.requiresPrompt).toBe(false);
  });

  it("prompts for confirmation in ASK mode", () => {
    const res = evaluateDownloadInterception(
      { url: "https://example.com/os.iso", filename: "os.iso" },
      { ...baseSettings, mode: "ask" }
    );
    expect(res.shouldIntercept).toBe(true);
    expect(res.requiresPrompt).toBe(true);
  });

  it("strips temporary Chromium .crdownload and extracts real extension from URL", () => {
    const filename = "Unconfirmed 987654.crdownload";
    const url = "https://example.com/downloads/archive.zip";

    const clean = extractCleanFilename(filename, url);
    expect(clean).toBe("archive.zip");

    const ext = getFileExtension(filename, url);
    expect(ext).toBe("zip");

    const res = evaluateDownloadInterception(
      { url, filename },
      { ...baseSettings, interceptAll: false }
    );
    expect(res.shouldIntercept).toBe(true);
    expect(res.reason).toContain(".zip");
  });

  it("handles finalUrl redirect correctly", () => {
    const initialUrl = "https://example.com/redirect?id=42";
    const finalUrl = "https://cdn.example.com/files/installer.exe";

    const ext = getFileExtension("", initialUrl, finalUrl);
    expect(ext).toBe("exe");

    const res = evaluateDownloadInterception(
      { url: initialUrl, finalUrl },
      { ...baseSettings, interceptAll: false }
    );
    expect(res.shouldIntercept).toBe(true);
    expect(res.reason).toContain(".exe");
  });

  it("extracts checksum from URL hash", () => {
    const url = "https://example.com/ubuntu.iso#sha-256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect(extractChecksumFromUrl(url)).toBe("sha-256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

    const url2 = "https://example.com/file.tar.gz#md5=9e107d9d372bb6826bd81d3542a419d6";
    expect(extractChecksumFromUrl(url2)).toBe("md5=9e107d9d372bb6826bd81d3542a419d6");

    expect(extractChecksumFromUrl("https://example.com/no-hash.zip")).toBeUndefined();
  });

  it("resolves subDirectory based on routing rules", () => {
    const routes = [
      { pattern: "iso,dmg", subDirectory: "DiskImages" },
      { pattern: "video/*", subDirectory: "Videos" },
      { pattern: "jpg,png,image/*", subDirectory: "Images" },
      { pattern: "*", subDirectory: "Others" },
    ];
    expect(resolveSubDirectory("archlinux.iso", "iso", undefined, routes)).toBe("DiskImages");
    expect(resolveSubDirectory("clip.mp4", "mp4", "video/mp4", routes)).toBe("Videos");
    expect(resolveSubDirectory("photo.png", "png", "image/png", routes)).toBe("Images");
    expect(resolveSubDirectory("unknown.xyz", "xyz", "application/octet-stream", routes)).toBe("Others");
  });

  it("resolves complete Aria2 options for download item", () => {
    const opts = resolveAria2Options(
      {
        url: "https://example.com/archlinux.iso#sha-256=abcdef1234567890",
        filename: "archlinux.iso",
      },
      {
        ...baseSettings,
        defaultSplit: 10,
        defaultMaxConnectionPerServer: 10,
        subDirectoryRouting: [{ pattern: "iso", subDirectory: "ISOs" }],
      }
    );
    expect(opts?.split).toBe(10);
    expect(opts?.maxConnectionPerServer).toBe(10);
    expect(opts?.subDirectory).toBe("ISOs");
    expect(opts?.checksum).toBe("sha-256=abcdef1234567890");
  });
});
