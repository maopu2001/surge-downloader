import type {
  ExtensionSettings,
  Aria2DownloadOptions,
  SubDirectoryRoute,
} from "@aria2-browser/protocol";

const RESTRICTED_PROTOCOLS = [
  "blob:",
  "data:",
  "chrome:",
  "chrome-extension:",
  "about:",
  "javascript:",
];

export interface InterceptionEvaluation {
  shouldIntercept: boolean;
  requiresPrompt: boolean;
  reason: string;
}

export function extractCleanFilename(filename?: string, url?: string, finalUrl?: string): string {
  if (filename) {
    const base = filename.split(/[/\\]/).pop() || "";
    if (
      base &&
      !base.endsWith(".crdownload") &&
      !base.endsWith(".tmp") &&
      !base.startsWith("Unconfirmed ")
    ) {
      return base;
    }
  }

  const targetUrl = finalUrl || url || "";
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      const cleanPath = parsed.pathname.split("/").pop() || "";
      if (cleanPath && cleanPath.includes(".")) {
        return decodeURIComponent(cleanPath.split("?")[0].split("#")[0]);
      }
    } catch {
      // ignore
    }
  }

  return "";
}

export function getFileExtension(filename?: string, url?: string, finalUrl?: string): string {
  const name = extractCleanFilename(filename, url, finalUrl);
  let target = name;

  if (!target) {
    const targetUrl = finalUrl || url || "";
    try {
      const parsed = new URL(targetUrl);
      target = parsed.pathname;
    } catch {
      target = targetUrl;
    }
  }

  const clean = target.split("?")[0].split("#")[0];
  const lastDot = clean.lastIndexOf(".");
  if (lastDot === -1 || lastDot === clean.length - 1) {
    return "";
  }
  return clean.slice(lastDot + 1).toLowerCase();
}

function matchesExtension(ext: string, filename: string, allowedExtensions: string[]): boolean {
  const lowerName = filename.toLowerCase();
  for (const allowed of allowedExtensions) {
    const lowerAllowed = allowed.toLowerCase().replace(/^\./, "");
    if (ext === lowerAllowed || lowerName.endsWith(`.${lowerAllowed}`)) {
      return true;
    }
  }
  return false;
}

function matchDomainPattern(domain: string, pattern: string): boolean {
  const normDomain = domain.toLowerCase();
  const normPattern = pattern.toLowerCase().trim();

  if (normPattern.startsWith("*.")) {
    const root = normPattern.slice(2);
    return normDomain === root || normDomain.endsWith(`.${root}`);
  }

  return normDomain === normPattern;
}

function matchMimePattern(mimeType: string, pattern: string): boolean {
  const normMime = mimeType.toLowerCase();
  const normPattern = pattern.toLowerCase().trim();

  if (normPattern.endsWith("/*")) {
    const prefix = normPattern.slice(0, -1);
    return normMime.startsWith(prefix);
  }

  return normMime === normPattern;
}

export function evaluateDownloadInterception(
  downloadItem: {
    url: string;
    finalUrl?: string;
    filename?: string;
    mime?: string;
  },
  settings: ExtensionSettings
): InterceptionEvaluation {
  // 1. Global Mode Disabled (OFF)
  if (settings.mode === "off") {
    return { shouldIntercept: false, requiresPrompt: false, reason: "Mode is OFF" };
  }

  // 2. Restricted Protocols
  const testUrls = [downloadItem.url, downloadItem.finalUrl].filter(Boolean) as string[];
  for (const u of testUrls) {
    const lowerUrl = u.toLowerCase();
    for (const proto of RESTRICTED_PROTOCOLS) {
      if (lowerUrl.startsWith(proto)) {
        return {
          shouldIntercept: false,
          requiresPrompt: false,
          reason: `Restricted protocol: ${proto}`,
        };
      }
    }
  }

  const primaryUrl = downloadItem.finalUrl || downloadItem.url;
  let hostname = "";
  try {
    hostname = new URL(primaryUrl).hostname;
  } catch {
    return { shouldIntercept: false, requiresPrompt: false, reason: "Invalid URL structure" };
  }

  const cleanName = extractCleanFilename(downloadItem.filename, downloadItem.url, downloadItem.finalUrl);
  const ext = getFileExtension(downloadItem.filename, downloadItem.url, downloadItem.finalUrl);

  // 3. Domain Excluded
  for (const excludedDomain of settings.excludedDomains) {
    if (matchDomainPattern(hostname, excludedDomain)) {
      return {
        shouldIntercept: false,
        requiresPrompt: false,
        reason: `Domain excluded: ${excludedDomain}`,
      };
    }
  }

  // 4. Extension Excluded
  if (ext && matchesExtension(ext, cleanName, settings.excludedExtensions)) {
    return {
      shouldIntercept: false,
      requiresPrompt: false,
      reason: `Extension excluded: .${ext}`,
    };
  }

  let matched = false;
  let matchReason = "";

  // 5. Domain Explicitly Included
  for (const includedDomain of settings.includedDomains) {
    if (matchDomainPattern(hostname, includedDomain)) {
      matched = true;
      matchReason = `Domain explicitly included: ${includedDomain}`;
      break;
    }
  }

  // 6. Extension Explicitly Included
  if (!matched && ext && matchesExtension(ext, cleanName, settings.includedExtensions)) {
    matched = true;
    matchReason = `Extension explicitly included: .${ext}`;
  }

  // 7. MIME Type Match
  if (!matched && downloadItem.mime) {
    for (const mimePattern of settings.mimePatterns) {
      if (matchMimePattern(downloadItem.mime, mimePattern)) {
        matched = true;
        matchReason = `MIME type match: ${mimePattern}`;
        break;
      }
    }
  }

  // 8. Global Catch-All (if enabled)
  if (!matched && settings.interceptAll) {
    matched = true;
    matchReason = "Global interception enabled (interceptAll)";
  }

  // 9. Default Action
  if (!matched) {
    return { shouldIntercept: false, requiresPrompt: false, reason: "No matching rules and interceptAll disabled" };
  }

  if (settings.mode === "ask") {
    return { shouldIntercept: true, requiresPrompt: true, reason: matchReason };
  }

  return { shouldIntercept: true, requiresPrompt: false, reason: matchReason };
}

export function extractChecksumFromUrl(url: string): string | undefined {
  if (!url) return undefined;
  const hashIdx = url.indexOf("#");
  if (hashIdx === -1) return undefined;

  const hash = url.slice(hashIdx + 1);
  const match = hash.match(/(sha-?256|sha-?1|md5)=([a-fA-F0-9]+)/i);
  if (!match) return undefined;

  let algo = match[1].toLowerCase();
  if (algo === "sha256") algo = "sha-256";
  if (algo === "sha1") algo = "sha-1";

  const checksum = match[2].toLowerCase();
  return `${algo}=${checksum}`;
}

export function resolveSubDirectory(
  filename: string,
  ext: string,
  mime: string | undefined,
  routes: SubDirectoryRoute[]
): string | undefined {
  if (!routes || routes.length === 0) return "Others";

  const lowerName = filename.toLowerCase();
  const lowerExt = ext.toLowerCase().replace(/^\./, "");
  const lowerMime = (mime || "").toLowerCase();

  for (const route of routes) {
    if (!route.pattern || !route.subDirectory) continue;
    const patterns = route.pattern.split(",").map((p) => p.trim().toLowerCase());

    for (const p of patterns) {
      if (!p) continue;
      if (p === "*") {
        return route.subDirectory.trim();
      }
      const pClean = p.replace(/^\*\./, "").replace(/^\./, "");
      if (lowerExt && (lowerExt === pClean || lowerName.endsWith(`.${pClean}`))) {
        return route.subDirectory.trim();
      }
      if (lowerMime && matchMimePattern(lowerMime, p)) {
        return route.subDirectory.trim();
      }
    }
  }

  return "Others";
}

export function resolveAria2Options(
  downloadItem: {
    url: string;
    finalUrl?: string;
    filename?: string;
    mime?: string;
  },
  settings: ExtensionSettings
): Aria2DownloadOptions {
  const cleanName = extractCleanFilename(downloadItem.filename, downloadItem.url, downloadItem.finalUrl);
  const ext = getFileExtension(downloadItem.filename, downloadItem.url, downloadItem.finalUrl);
  const primaryUrl = downloadItem.finalUrl || downloadItem.url;

  const checksum = extractChecksumFromUrl(primaryUrl);
  const subDirectory = resolveSubDirectory(cleanName, ext, downloadItem.mime, settings.subDirectoryRouting || []);

  const options: Aria2DownloadOptions = {};

  if (settings.defaultSplit) options.split = settings.defaultSplit;
  if (settings.defaultMaxConnectionPerServer) options.maxConnectionPerServer = settings.defaultMaxConnectionPerServer;
  if (settings.defaultMinSplitSize) options.minSplitSize = settings.defaultMinSplitSize;
  if (settings.defaultMaxDownloadLimit && settings.defaultMaxDownloadLimit !== "0") {
    options.maxDownloadLimit = settings.defaultMaxDownloadLimit;
  }
  if (settings.defaultProxy && settings.defaultProxy.trim()) {
    options.allProxy = settings.defaultProxy.trim();
  }
  if (settings.defaultCheckCertificate !== undefined) {
    options.checkCertificate = settings.defaultCheckCertificate;
  }
  if (settings.autoFileRenaming !== undefined) {
    options.autoFileRenaming = settings.autoFileRenaming;
  }
  if (settings.allowOverwrite !== undefined) {
    options.allowOverwrite = settings.allowOverwrite;
  }
  if (checksum) {
    options.checksum = checksum;
  }
  if (subDirectory) {
    options.subDirectory = subDirectory;
  }

  return options;
}
