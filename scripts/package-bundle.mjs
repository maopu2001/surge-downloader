#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const releaseDir = path.join(rootDir, "release");
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = pkg.version || "1.0.0";
const bundleName = `surge-v${version}-installer`;
const bundleDir = path.join(releaseDir, bundleName);

console.log(`\n=== Building Unified Surge Installer Bundle (v${version}) ===\n`);

// 1. Clean and prepare release directory
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(bundleDir, { recursive: true });

// 2. Build Extension & Native Host
console.log("Step 1: Building Extension and Native Host...");
execSync("pnpm run build", { cwd: rootDir, stdio: "inherit" });

// 3. Copy Extension Artifacts
console.log("\nStep 2: Copying Extension files...");
const extDest = path.join(bundleDir, "extension");
fs.cpSync(path.join(rootDir, "apps/extension/dist"), extDest, { recursive: true });

// 4. Copy Host Artifacts & Scripts
console.log("Step 3: Copying Native Host files...");
const hostDest = path.join(bundleDir, "host");
fs.mkdirSync(hostDest, { recursive: true });
fs.copyFileSync(
  path.join(rootDir, "apps/native-host/dist/bundle.cjs"),
  path.join(hostDest, "bundle.cjs")
);
fs.copyFileSync(
  path.join(rootDir, "scripts/register-host.mjs"),
  path.join(hostDest, "register-host.mjs")
);

// 5. Create 1-Click setup.sh (macOS & Linux)
console.log("Step 4: Generating setup scripts...");
const setupSh = `#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_PATH="$DIR/extension"

echo "========================================================"
echo "    Surge aria2 Download Manager - 1-Click Installer    "
echo "========================================================"
echo ""

# 1. Check/Install aria2c
if ! command -v aria2c &> /dev/null; then
  echo "[+] aria2c not found. Attempting to install..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew &> /dev/null; then
      brew install aria2
    else
      echo "[!] Homebrew not found. Please install aria2 manually (brew install aria2)."
    fi
  elif command -v apt-get &> /dev/null; then
    sudo apt-get update && sudo apt-get install -y aria2
  elif command -v pacman &> /dev/null; then
    sudo pacman -S --noconfirm aria2
  elif command -v dnf &> /dev/null; then
    sudo dnf install -y aria2
  else
    echo "[!] Please install aria2c via your package manager."
  fi
else
  echo "[✓] aria2c found: $(aria2c --version | head -n 1)"
fi

echo ""
echo "[+] Registering Native Messaging Host with Chrome/Chromium/Brave/Edge..."
node "$DIR/host/register-host.mjs" "\${1:-}"

echo ""
echo "========================================================"
echo " [✓] Installation complete!"
echo ""
echo " Next Steps to load extension in browser:"
echo " 1. Open: chrome://extensions/ (or brave://extensions/ / edge://extensions/)"
echo " 2. Turn ON 'Developer mode' (top-right toggle)"
echo " 3. Click 'Load unpacked' (top-left button)"
echo " 4. Select this folder:"
echo "    $EXT_PATH"
echo "========================================================"
echo ""

# Open extensions page automatically if desktop environment available
if [[ "$OSTYPE" == "darwin"* ]]; then
  open "chrome://extensions/" 2>/dev/null || open "http://localhost" 2>/dev/null || true
elif command -v xdg-open &> /dev/null; then
  xdg-open "chrome://extensions/" 2>/dev/null || true
fi
`;
fs.writeFileSync(path.join(bundleDir, "setup.sh"), setupSh, { mode: 0o755 });

// 6. Create 1-Click setup.bat (Windows)
const setupBat = `@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo     Surge aria2 Download Manager - 1-Click Installer    
echo ========================================================
echo.

where aria2c >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [+] aria2c not found. Attempting install with winget...
  winget install aria2.aria2 --accept-source-agreements --accept-package-agreements
) else (
  echo [OK] aria2c is installed.
)

echo.
echo [+] Registering Native Messaging Host...
node "%~dp0host\\register-host.mjs" %1

echo.
echo ========================================================
echo  [OK] Installation complete!
echo.
echo  Next Steps to load extension in browser:
echo  1. Open: chrome://extensions/
echo  2. Turn ON "Developer mode" (top-right toggle)
echo  3. Click "Load unpacked"
echo  4. Select this folder:
echo     %~dp0extension
echo ========================================================
echo.
pause
`;
fs.writeFileSync(path.join(bundleDir, "setup.bat"), setupBat);

// 7. Generate README for client
const clientReadme = `# Surge - aria2 Download Manager

## Quick 1-Click Setup

### macOS / Linux:
Open Terminal in this folder and run:
\`\`\`bash
chmod +x setup.sh
./setup.sh
\`\`\`

### Windows:
Double-click \`setup.bat\` or run in PowerShell/CMD:
\`\`\`cmd
setup.bat
\`\`\`

---

## Load Extension in Browser:
1. Open \`chrome://extensions/\` in your Chromium browser (Chrome, Brave, Edge, Opera, etc.).
2. Enable **Developer mode** toggle in top-right.
3. Click **Load unpacked** in top-left.
4. Select the \`extension\` folder in this package.

That's it! Surge is ready to intercept and speed up your downloads.
`;
fs.writeFileSync(path.join(bundleDir, "README.md"), clientReadme);

// 8. Package into .zip archive
console.log("Step 5: Creating zip archive...");
try {
  const zipPath = path.join(releaseDir, `${bundleName}.zip`);
  execSync(`zip -r "${zipPath}" "${bundleName}"`, { cwd: releaseDir, stdio: "pipe" });
  console.log(`\n[✓] Successfully created release archive:`);
  console.log(`    ${zipPath}`);
} catch {
  console.log(`\n[✓] Release folder prepared: ${bundleDir}`);
}

console.log("\nDone!\n");
