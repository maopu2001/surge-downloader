import fs from "node:fs";
import path from "node:path";
import { sanitizeDirectory, sanitizeFilename } from "./sanitizer.js";

export interface CleanFilesOptions {
  gid?: string;
  directory?: string;
  filename?: string;
  filePaths?: string[];
  shouldDelete: boolean;
}

export interface CleanFilesResult {
  fileDeleted: boolean;
  deletedPaths: string[];
}

export function cleanDownloadFiles(options: CleanFilesOptions): CleanFilesResult {
  const { directory, filename, filePaths, shouldDelete } = options;
  if (!shouldDelete) {
    return { fileDeleted: false, deletedPaths: [] };
  }

  const candidatePaths = new Set<string>();

  // 1. Add explicitly provided file paths
  if (filePaths && Array.isArray(filePaths)) {
    for (const p of filePaths) {
      if (p && typeof p === "string" && p.trim()) {
        candidatePaths.add(path.normalize(p.trim()));
      }
    }
  }

  // 2. Add paths resolved from directory + filename
  if (filename && typeof filename === "string" && filename.trim()) {
    const rawName = filename.trim();
    const sanitized = sanitizeFilename(rawName);
    const namesToTry = [rawName];
    if (sanitized.valid && sanitized.sanitizedFilename && sanitized.sanitizedFilename !== rawName) {
      namesToTry.push(sanitized.sanitizedFilename);
    }

    const dirCheck = sanitizeDirectory(directory);
    if (dirCheck.valid && dirCheck.sanitizedPath) {
      for (const name of namesToTry) {
        candidatePaths.add(path.join(dirCheck.sanitizedPath, name));
      }
    }

    // Also check default downloads folder if custom directory was supplied
    if (directory && directory.trim()) {
      const defaultDirCheck = sanitizeDirectory(undefined);
      if (
        defaultDirCheck.valid &&
        defaultDirCheck.sanitizedPath &&
        defaultDirCheck.sanitizedPath !== dirCheck.sanitizedPath
      ) {
        for (const name of namesToTry) {
          candidatePaths.add(path.join(defaultDirCheck.sanitizedPath, name));
        }
      }
    }
  }

  let fileDeleted = false;
  const deletedPaths: string[] = [];

  for (const targetPath of candidatePaths) {
    // Delete target file or directory
    try {
      if (fs.existsSync(targetPath)) {
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
          fs.rmSync(targetPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(targetPath);
        }
        fileDeleted = true;
        if (!deletedPaths.includes(targetPath)) {
          deletedPaths.push(targetPath);
        }
      }
    } catch {
      // ignore
    }

    // Delete aria2 control / piece state file
    const metaPath = targetPath.endsWith(".aria2") ? targetPath : `${targetPath}.aria2`;
    try {
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
        fileDeleted = true;
        if (!deletedPaths.includes(metaPath)) {
          deletedPaths.push(metaPath);
        }
      }
    } catch {
      // ignore
    }

    // If candidate path itself ended with .aria2, also ensure the base file is deleted
    if (targetPath.endsWith(".aria2")) {
      const basePath = targetPath.slice(0, -6);
      try {
        if (fs.existsSync(basePath)) {
          fs.unlinkSync(basePath);
          fileDeleted = true;
          if (!deletedPaths.includes(basePath)) {
            deletedPaths.push(basePath);
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return { fileDeleted, deletedPaths };
}

export interface FileStatusCheckOptions {
  gid: string;
  filename: string;
  directory?: string;
  filePaths?: string[];
  isCompleted: boolean;
}

export interface SingleFileStatusResult {
  gid: string;
  missing: boolean;
  reason?: string;
}

export function checkSingleDownloadStatus(options: FileStatusCheckOptions): SingleFileStatusResult {
  const { gid, filename, directory, filePaths, isCompleted } = options;

  let candidatePaths: string[] = [];

  if (filePaths && filePaths.length > 0) {
    candidatePaths.push(...filePaths);
  }

  if (filename) {
    const rawName = filename.trim();
    const sanitized = sanitizeFilename(rawName);
    const cleanName = sanitized.valid && sanitized.sanitizedFilename ? sanitized.sanitizedFilename : rawName;
    const dirCheck = sanitizeDirectory(directory);
    if (dirCheck.valid && dirCheck.sanitizedPath) {
      candidatePaths.push(path.join(dirCheck.sanitizedPath, cleanName));
      if (cleanName !== rawName) {
        candidatePaths.push(path.join(dirCheck.sanitizedPath, rawName));
      }
    }
  }

  if (candidatePaths.length === 0) {
    return { gid, missing: true, reason: "Could not resolve file path" };
  }

  // Find any matched existing path or use first candidate
  let targetPath = candidatePaths.find((p) => fs.existsSync(p) || fs.existsSync(`${p}.aria2`)) || candidatePaths[0];

  const fileExists = fs.existsSync(targetPath);
  const ariaControlExists = fs.existsSync(`${targetPath}.aria2`);

  if (isCompleted) {
    if (!fileExists) {
      return { gid, missing: true, reason: "Completed file was deleted from folder" };
    }
    return { gid, missing: false };
  } else {
    // For not completed files: if both missing, or file missing, or aria2 control missing -> missing
    if (!fileExists && !ariaControlExists) {
      return { gid, missing: true, reason: "Download files were deleted from folder" };
    }
    if (!fileExists) {
      return { gid, missing: true, reason: "Incomplete file was deleted from folder" };
    }
    if (!ariaControlExists) {
      return { gid, missing: true, reason: "Aria2 control file was deleted from folder" };
    }
    return { gid, missing: false };
  }
}

export function checkDownloadFilesStatus(items: FileStatusCheckOptions[]): SingleFileStatusResult[] {
  return items.map((item) => checkSingleDownloadStatus(item));
}
