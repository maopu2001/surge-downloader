#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const hostDir = path.join(rootDir, "apps/native-host");
const binDir = path.join(hostDir, "bin");
const distDir = path.join(hostDir, "dist");

console.log("=== Building Node SEA Standalone Host Binary ===");

fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

// 1. Bundle TypeScript to CJS
console.log("Step 1: Bundling with esbuild...");
execSync(
  `pnpm --filter @aria2-browser/native-host run build`,
  { cwd: rootDir, stdio: "inherit" }
);

const targetName = process.platform === "win32" ? "aria2-browser-host.cmd" : "aria2-browser-host";
const targetPath = path.join(binDir, targetName);

let seaSupported = true;
try {
  console.log("Step 2: Generating SEA blob with node --build-sea...");
  execSync(`node --build-sea sea-config.json`, { cwd: hostDir, stdio: "pipe" });
} catch (err) {
  const errMsg = err.stderr?.toString() || err.message;
  if (errMsg.includes("Single executable application is disabled")) {
    console.warn("\n[Notice] Current Node.js binary was compiled without SEA support (e.g. Homebrew build).");
    console.warn("Generating executable Node standalone launcher instead...\n");
    seaSupported = false;
  } else {
    throw err;
  }
}

if (seaSupported) {
  const nodeExe = process.execPath;
  console.log(`Step 3: Copying Node runtime from ${nodeExe} to ${targetPath}...`);
  fs.copyFileSync(nodeExe, targetPath);
  fs.chmodSync(targetPath, 0o755);

  if (process.platform === "darwin") {
    console.log("Step 4: Removing macOS signature from binary copy...");
    try {
      execSync(`codesign --remove-signature "${targetPath}"`, { stdio: "inherit" });
    } catch {
      // Signature might not be present
    }
  }

  console.log("Step 5: Injecting blob with postject...");
  const blobPath = path.join(distDir, "sea-prep.blob");
  const postjectArgs = [
    `"${targetPath}"`,
    "NODE_SEA_BLOB",
    `"${blobPath}"`,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ];

  if (process.platform === "darwin") {
    postjectArgs.push("--macho-segment-name", "NODE_SEA");
  }

  execSync(`pnpm dlx postject ${postjectArgs.join(" ")}`, {
    cwd: hostDir,
    stdio: "inherit",
  });

  if (process.platform === "darwin") {
    console.log("Step 6: Ad-hoc code signing on macOS...");
    execSync(`codesign --sign - "${targetPath}"`, { stdio: "inherit" });
  }
} else {
  // Create standalone executable script
  if (process.platform === "win32") {
    fs.writeFileSync(
      targetPath,
      `@echo off\r\nnode "%~dp0..\\dist\\bundle.cjs" %*\r\n`
    );
  } else {
    fs.writeFileSync(
      targetPath,
      `#!/bin/bash\nexport PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.local/bin:$PATH"\nif command -v node >/dev/null 2>&1; then\n  NODE_BIN="$(command -v node)"\nelif [ -x "/opt/homebrew/bin/node" ]; then\n  NODE_BIN="/opt/homebrew/bin/node"\nelif [ -x "/usr/local/bin/node" ]; then\n  NODE_BIN="/usr/local/bin/node"\nelse\n  echo "Node.js not found in PATH or standard paths" >&2\n  exit 1\nfi\nDIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$NODE_BIN" "$DIR/../dist/bundle.cjs" "$@"\n`
    );
    fs.chmodSync(targetPath, 0o755);
  }
}

console.log(`\nHost binary/launcher ready at:\n${targetPath}`);
