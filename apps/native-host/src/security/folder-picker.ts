import { spawn } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import { sanitizeDirectory } from "./sanitizer.js";

export interface SelectFolderResult {
  canceled: boolean;
  path?: string;
  error?: string;
}

export function pickNativeFolder(
  promptTitle = "Select Download Folder",
  initialPath?: string
): Promise<SelectFolderResult> {
  return new Promise((resolve) => {
    let cmd: string;
    let args: string[];

    let startingDir: string | undefined;
    if (initialPath && typeof initialPath === "string" && initialPath.trim()) {
      const sanitized = sanitizeDirectory(initialPath);
      if (sanitized.valid && sanitized.sanitizedPath) {
        try {
          if (!fs.existsSync(sanitized.sanitizedPath)) {
            fs.mkdirSync(sanitized.sanitizedPath, { recursive: true });
          }
          if (fs.existsSync(sanitized.sanitizedPath)) {
            startingDir = sanitized.sanitizedPath;
          }
        } catch {
          // Ignore directory creation failure, fallback to startingDir = undefined
        }
      }
    }

    if (process.platform === "darwin") {
      cmd = "osascript";
      const safeTitle = promptTitle.replace(/"/g, '\\"');
      if (startingDir) {
        const safePath = startingDir.replace(/"/g, '\\"');
        args = [
          "-e",
          `tell application "System Events" to activate`,
          "-e",
          `POSIX path of (choose folder with prompt "${safeTitle}" default location (POSIX file "${safePath}"))`,
        ];
      } else {
        args = [
          "-e",
          `tell application "System Events" to activate`,
          "-e",
          `POSIX path of (choose folder with prompt "${safeTitle}")`,
        ];
      }
    } else if (process.platform === "win32") {
      cmd = "powershell.exe";
      const safeTitle = promptTitle.replace(/'/g, "''");
      const safePath = (startingDir || "").replace(/'/g, "''");
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${safeTitle}'
$dialog.ShowNewFolderButton = $true
if ('${safePath}' -ne '') {
  $dialog.SelectedPath = '${safePath}'
}
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
if ($dialog.ShowDialog($topForm) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
} else {
  Write-Output '__CANCELLED__'
}
`.trim();
      args = ["-NoProfile", "-NonInteractive", "-Command", psScript];
    } else {
      // Linux: standard zenity dialog
      cmd = "zenity";
      args = ["--file-selection", "--directory", `--title=${promptTitle}`];
      if (startingDir) {
        args.push(`--filename=${startingDir.endsWith("/") ? startingDir : startingDir + "/"}`);
      }
    }

    try {
      const child = spawn(cmd, args, {
        shell: false, // Strict constraint: NEVER invoke shell
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (err) => {
        resolve({ canceled: true, error: `Picker spawn error: ${err.message}` });
      });

      child.on("close", (code) => {
        if (code !== 0) {
          // User clicked Cancel or closed dialog
          resolve({ canceled: true });
          return;
        }

        const rawPath = stdout.trim();
        if (!rawPath || rawPath === "__CANCELLED__") {
          resolve({ canceled: true });
          return;
        }

        // Sanitize and validate chosen directory
        const check = sanitizeDirectory(rawPath);
        if (check.valid && check.sanitizedPath && fs.existsSync(check.sanitizedPath)) {
          resolve({ canceled: false, path: check.sanitizedPath });
        } else {
          resolve({ canceled: true, error: check.error || "Invalid folder chosen" });
        }
      });
    } catch (err) {
      resolve({ canceled: true, error: (err as Error).message });
    }
  });
}
