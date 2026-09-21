#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const hostDir = path.join(rootDir, "apps/native-host");
const bundlePath = path.join(hostDir, "dist/bundle.cjs");

if (!fs.existsSync(bundlePath)) {
  console.log("Bundle not found. Building first...");
  execSync(`pnpm --filter @aria2-browser/native-host run build`, { cwd: rootDir, stdio: "inherit" });
}

// Extension ID can be passed as CLI arg, e.g. node scripts/register-host.mjs <extension-id>
const defaultExtensionId = "afclijohfgakkgmodcdanimdnhppoljc";
const extensionId = process.argv[2] || defaultExtensionId;

const allowedOrigins = [
  `chrome-extension://${extensionId}/`,
];
if (extensionId !== defaultExtensionId) {
  allowedOrigins.push(`chrome-extension://${defaultExtensionId}/`);
}

const homeDir = os.homedir();
const targets = [];

if (process.platform === "darwin") {
  targets.push(
    path.join(homeDir, "Library/Application Support/Google/Chrome/NativeMessagingHosts"),
    path.join(homeDir, "Library/Application Support/Chromium/NativeMessagingHosts"),
    path.join(homeDir, "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts")
  );
} else if (process.platform === "linux") {
  targets.push(
    path.join(homeDir, ".config/google-chrome/NativeMessagingHosts"),
    path.join(homeDir, ".config/chromium/NativeMessagingHosts"),
    path.join(homeDir, ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts")
  );
}

console.log("=== Registering Native Messaging Host ===");
console.log(`Allowed Origins: ${allowedOrigins.join(", ")}`);

// Also write local workspace template
const localManifestDir = path.join(hostDir, "manifest");
fs.mkdirSync(localManifestDir, { recursive: true });
const localHostPath = path.join(hostDir, "bin/aria2-browser-host");
const localManifest = {
  name: "com.aria2.browser.host",
  description: "Aria2 Browser Native Messaging Host",
  path: path.resolve(localHostPath),
  type: "stdio",
  allowed_origins: allowedOrigins,
};
fs.writeFileSync(
  path.join(localManifestDir, "com.aria2.browser.host.json"),
  JSON.stringify(localManifest, null, 2)
);

for (const targetDir of targets) {
  try {
    fs.mkdirSync(targetDir, { recursive: true });

    // 1. Copy self-contained bundle directly into the browser's own NativeMessagingHosts folder
    // This avoids macOS TCC privacy restrictions that block GUI apps from ~/Documents!
    const destBundle = path.join(targetDir, "aria2-host-bundle.cjs");
    fs.copyFileSync(bundlePath, destBundle);

    // 2. Create launcher inside target directory
    const destHost = path.join(targetDir, "aria2-browser-host");
    const launcherScript = `#!/bin/bash
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.local/bin:$PATH"

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -x "/opt/homebrew/bin/node" ]; then
  NODE_BIN="/opt/homebrew/bin/node"
elif [ -x "/usr/local/bin/node" ]; then
  NODE_BIN="/usr/local/bin/node"
else
  echo "Node.js not found in PATH or standard paths" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$NODE_BIN" "$DIR/aria2-host-bundle.cjs" "$@"
`;
    fs.writeFileSync(destHost, launcherScript);
    fs.chmodSync(destHost, 0o755);

    // 3. Write manifest pointing to this installed host
    const manifest = {
      name: "com.aria2.browser.host",
      description: "Aria2 Browser Native Messaging Host",
      path: destHost,
      type: "stdio",
      allowed_origins: allowedOrigins,
    };
    const manifestPath = path.join(targetDir, "com.aria2.browser.host.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`Installed -> ${manifestPath}`);
    console.log(`Executable -> ${destHost}`);
  } catch (err) {
    console.warn(`Skipped ${targetDir}: ${err.message}`);
  }
}

console.log("\nRegistration script finished.");
