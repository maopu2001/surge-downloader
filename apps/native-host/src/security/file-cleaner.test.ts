import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  cleanDownloadFiles,
  checkSingleDownloadStatus,
  checkDownloadFilesStatus,
} from "./file-cleaner.js";

describe("cleanDownloadFiles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "surge-cleaner-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("does nothing when shouldDelete is false", () => {
    const filePath = path.join(tempDir, "sample.iso");
    fs.writeFileSync(filePath, "sample-content");

    const res = cleanDownloadFiles({
      directory: tempDir,
      filename: "sample.iso",
      filePaths: [filePath],
      shouldDelete: false,
    });

    expect(res.fileDeleted).toBe(false);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("deletes incomplete partial file and .aria2 control file", () => {
    const filePath = path.join(tempDir, "video.mp4");
    const metaPath = path.join(tempDir, "video.mp4.aria2");
    fs.writeFileSync(filePath, "partial data");
    fs.writeFileSync(metaPath, "aria2-metadata-chunk");

    const res = cleanDownloadFiles({
      directory: tempDir,
      filename: "video.mp4",
      filePaths: [filePath],
      shouldDelete: true,
    });

    expect(res.fileDeleted).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(metaPath)).toBe(false);
  });

  it("deletes orphan .aria2 control file when data file is not yet created", () => {
    const metaPath = path.join(tempDir, "archive.zip.aria2");
    fs.writeFileSync(metaPath, "aria2-metadata");

    const res = cleanDownloadFiles({
      directory: tempDir,
      filename: "archive.zip",
      filePaths: [path.join(tempDir, "archive.zip")],
      shouldDelete: true,
    });

    expect(res.fileDeleted).toBe(true);
    expect(fs.existsSync(metaPath)).toBe(false);
  });

  it("deletes partial file even if .aria2 control file does not exist", () => {
    const filePath = path.join(tempDir, "partial.bin");
    fs.writeFileSync(filePath, "some bytes");

    const res = cleanDownloadFiles({
      directory: tempDir,
      filename: "partial.bin",
      shouldDelete: true,
    });

    expect(res.fileDeleted).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("deletes directory recursively if download target was a directory", () => {
    const subFolder = path.join(tempDir, "torrent_dir");
    fs.mkdirSync(subFolder, { recursive: true });
    fs.writeFileSync(path.join(subFolder, "file1.txt"), "data1");
    fs.writeFileSync(path.join(subFolder, "file2.txt"), "data2");

    const res = cleanDownloadFiles({
      filePaths: [subFolder],
      shouldDelete: true,
    });

    expect(res.fileDeleted).toBe(true);
    expect(fs.existsSync(subFolder)).toBe(false);
  });

  it("handles sanitized filename mismatches properly", () => {
    // Sanitizer converts ":" to "_"
    const unsanitized = "video:clip.mp4";
    const sanitizedName = "video_clip.mp4";
    const filePath = path.join(tempDir, sanitizedName);
    const metaPath = path.join(tempDir, `${sanitizedName}.aria2`);

    fs.writeFileSync(filePath, "video bytes");
    fs.writeFileSync(metaPath, "meta");

    const res = cleanDownloadFiles({
      directory: tempDir,
      filename: unsanitized,
      shouldDelete: true,
    });

    expect(res.fileDeleted).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(metaPath)).toBe(false);
  });

  it("returns false cleanly if target files do not exist", () => {
    const res = cleanDownloadFiles({
      directory: tempDir,
      filename: "ghost.zip",
      filePaths: [path.join(tempDir, "ghost.zip")],
      shouldDelete: true,
    });

    expect(res.fileDeleted).toBe(false);
    expect(res.deletedPaths).toHaveLength(0);
  });
});

describe("checkDownloadFilesStatus", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "surge-status-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("identifies completed file as healthy when file exists", () => {
    const filePath = path.join(tempDir, "done.zip");
    fs.writeFileSync(filePath, "complete file content");

    const res = checkSingleDownloadStatus({
      gid: "1",
      filename: "done.zip",
      directory: tempDir,
      isCompleted: true,
    });

    expect(res.missing).toBe(false);
  });

  it("flags completed file as missing when file is deleted", () => {
    const res = checkSingleDownloadStatus({
      gid: "2",
      filename: "done.zip",
      directory: tempDir,
      isCompleted: true,
    });

    expect(res.missing).toBe(true);
    expect(res.reason).toContain("Completed file");
  });

  it("identifies incomplete file as healthy when both data and .aria2 exist", () => {
    const filePath = path.join(tempDir, "downloading.bin");
    const metaPath = path.join(tempDir, "downloading.bin.aria2");
    fs.writeFileSync(filePath, "partial data");
    fs.writeFileSync(metaPath, "control data");

    const res = checkSingleDownloadStatus({
      gid: "3",
      filename: "downloading.bin",
      directory: tempDir,
      isCompleted: false,
    });

    expect(res.missing).toBe(false);
  });

  it("flags incomplete file as missing when data file is deleted", () => {
    const metaPath = path.join(tempDir, "downloading.bin.aria2");
    fs.writeFileSync(metaPath, "control data");

    const res = checkSingleDownloadStatus({
      gid: "4",
      filename: "downloading.bin",
      directory: tempDir,
      isCompleted: false,
    });

    expect(res.missing).toBe(true);
    expect(res.reason).toContain("Incomplete file was deleted");
  });

  it("flags incomplete file as missing when .aria2 control file is deleted", () => {
    const filePath = path.join(tempDir, "downloading.bin");
    fs.writeFileSync(filePath, "partial data");

    const res = checkSingleDownloadStatus({
      gid: "5",
      filename: "downloading.bin",
      directory: tempDir,
      isCompleted: false,
    });

    expect(res.missing).toBe(true);
    expect(res.reason).toContain("Aria2 control file was deleted");
  });

  it("evaluates batch of download items correctly", () => {
    const filePath = path.join(tempDir, "fileA.iso");
    fs.writeFileSync(filePath, "data");

    const results = checkDownloadFilesStatus([
      { gid: "a", filename: "fileA.iso", directory: tempDir, isCompleted: true },
      { gid: "b", filename: "fileB.iso", directory: tempDir, isCompleted: true },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].missing).toBe(false);
    expect(results[1].missing).toBe(true);
  });
});
