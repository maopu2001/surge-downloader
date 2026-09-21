import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const FORBIDDEN_SCHEMES = ["blob:", "data:", "chrome:", "chrome-extension:", "about:", "javascript:", "file:"];

export interface SanitizedPathResult {
  valid: boolean;
  sanitizedPath?: string;
  error?: string;
}

export interface SanitizedFilenameResult {
  valid: boolean;
  sanitizedFilename?: string;
  error?: string;
}

export function validateUrl(rawUrl: string): { valid: boolean; error?: string } {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "URL must be a non-empty string" };
  }

  const trimmed = rawUrl.trim();
  for (const forbidden of FORBIDDEN_SCHEMES) {
    if (trimmed.toLowerCase().startsWith(forbidden)) {
      return { valid: false, error: `Forbidden URL scheme: ${forbidden}` };
    }
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (!["http:", "https:", "ftp:", "sftp:", "magnet:"].includes(protocol)) {
      return { valid: false, error: `Unsupported protocol: ${protocol}` };
    }
    return { valid: true };
  } catch {
    // magnet links may not always parse as standard Web URLs
    if (trimmed.toLowerCase().startsWith("magnet:?")) {
      return { valid: true };
    }
    return { valid: false, error: "Invalid URL format" };
  }
}

export function sanitizeFilename(filename?: string): SanitizedFilenameResult {
  if (!filename || typeof filename !== "string") {
    return { valid: false, error: "Filename must be a non-empty string" };
  }

  // Strip null bytes and control characters (ASCII 0-31)
  let clean = filename.replace(/[\0-\x1F\x7F]/g, "").trim();

  // Strip directory separators (/ and \)
  clean = clean.replace(/[/\\]/g, "_");

  // Strip Windows reserved characters: < > : " / \ | ? *
  clean = clean.replace(/[<>:"|?*]/g, "_");

  // Trim trailing periods and spaces (Windows restriction)
  clean = clean.replace(/[. ]+$/, "");

  if (clean.length === 0) {
    return { valid: false, error: "Filename is empty after sanitization" };
  }

  const byteLength = Buffer.byteLength(clean, "utf8");
  if (byteLength > 255) {
    return { valid: false, error: `Filename exceeds 255 bytes (${byteLength} bytes)` };
  }

  if (WINDOWS_RESERVED_NAMES.test(clean)) {
    clean = `_${clean}`;
  }

  return { valid: true, sanitizedFilename: clean };
}

export function sanitizeDirectory(rawDirectory?: string): SanitizedPathResult {
  const defaultDownloads = path.join(os.homedir(), "Downloads", "Surge");
  if (!rawDirectory || typeof rawDirectory !== "string" || rawDirectory.trim() === "") {
    // Default to OS user downloads directory ~/Downloads/Surge
    return { valid: true, sanitizedPath: path.normalize(defaultDownloads) };
  }

  // Strip null bytes and control characters
  const clean = rawDirectory.replace(/[\0-\x1F\x7F]/g, "").trim();

  // Traversal check
  if (clean.includes("..")) {
    return { valid: false, error: "Directory contains relative traversal ('..')" };
  }

  let resolved: string;
  if (clean.startsWith("~")) {
    resolved = path.join(os.homedir(), clean.slice(1));
  } else if (!path.isAbsolute(clean)) {
    resolved = path.resolve(defaultDownloads, clean);
  } else {
    resolved = path.resolve(path.normalize(clean));
  }

  return { valid: true, sanitizedPath: path.normalize(resolved) };
}

export function sanitizeSubDirectory(baseDir: string, subDir?: string): SanitizedPathResult {
  if (!subDir || typeof subDir !== "string" || subDir.trim() === "") {
    return { valid: true, sanitizedPath: baseDir };
  }

  const clean = subDir.replace(/[\0-\x1F\x7F]/g, "").trim();
  if (clean.includes("..")) {
    return { valid: false, error: "Subdirectory contains relative traversal ('..')" };
  }

  const normalized = path.normalize(clean).replace(/^([/\\])+/, "");
  const targetPath = path.resolve(baseDir, normalized);

  const relative = path.relative(baseDir, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { valid: false, error: "Subdirectory escapes base download directory" };
  }

  return { valid: true, sanitizedPath: targetPath };
}

export function validateProxy(proxy?: string): { valid: boolean; error?: string } {
  if (!proxy || typeof proxy !== "string" || proxy.trim() === "") {
    return { valid: true };
  }

  const trimmed = proxy.trim();
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (!["http:", "https:", "socks5:", "socks5h:"].includes(protocol)) {
      return { valid: false, error: `Unsupported proxy protocol: ${protocol}` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid proxy URL format" };
  }
}

export function resolveUniqueFilename(directory: string, filename: string): string {
  const fullPath = path.join(directory, filename);
  // If file does not exist, use original filename
  if (!fs.existsSync(fullPath)) {
    return filename;
  }

  // If previous file already finished (no active .aria2 control file), resolve to name (1).ext
  if (!fs.existsSync(`${fullPath}.aria2`)) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);

    let counter = 1;
    while (counter < 1000) {
      const candidate = `${base} (${counter})${ext}`;
      const candidatePath = path.join(directory, candidate);
      if (!fs.existsSync(candidatePath) && !fs.existsSync(`${candidatePath}.aria2`)) {
        return candidate;
      }
      counter++;
    }
  }

  return filename;
}
