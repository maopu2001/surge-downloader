import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { sanitizeDirectory, sanitizeFilename } from "./sanitizer.js";

export interface RevealTarget {
  targetPath: string;
  isDirectory: boolean;
}

export function resolveSafeTarget(
  explicitDir?: string,
  explicitFilename?: string
): RevealTarget {
  const dirCheck = sanitizeDirectory(explicitDir);
  const baseDir = dirCheck.valid && dirCheck.sanitizedPath
    ? dirCheck.sanitizedPath
    : path.join(os.homedir(), "Downloads");

  if (explicitFilename) {
    const fileCheck = sanitizeFilename(explicitFilename);
    if (fileCheck.valid && fileCheck.sanitizedFilename) {
      const candidatePath = path.join(baseDir, fileCheck.sanitizedFilename);
      if (fs.existsSync(candidatePath)) {
        return { targetPath: candidatePath, isDirectory: false };
      }
    }
  }

  // If directory exists, return it
  if (fs.existsSync(baseDir)) {
    return { targetPath: baseDir, isDirectory: true };
  }

  // Fallback to homedir
  const fallback = os.homedir();
  return { targetPath: fallback, isDirectory: true };
}

export function openPathInFileManager(target: RevealTarget): Promise<void> {
  return new Promise((resolve, reject) => {
    const { targetPath, isDirectory } = target;

    let command: string;
    let args: string[];

    if (process.platform === "darwin") {
      command = "open";
      args = isDirectory ? [targetPath] : ["-R", targetPath];
    } else if (process.platform === "win32") {
      command = "explorer.exe";
      args = isDirectory ? [targetPath] : [`/select,${targetPath}`];
    } else {
      // Linux / BSD
      command = "xdg-open";
      args = isDirectory ? [targetPath] : [path.dirname(targetPath)];
    }

    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
        shell: false, // Hard constraint: NEVER invoke shell
      });
      child.unref();
      child.on("error", (err) => reject(err));
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}
