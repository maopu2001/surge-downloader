# Security & Process Isolation Boundary

Because the Native Host runs with full local operating system privileges, it must be treated as an untrusted boundary.

## Hard Rules for the Native Host

* **No Shell Execution:** Never use `child_process.exec()`, `execSync()`, or `shell: true`. All process execution must use `child_process.spawn()` with structured, static argument vectors.
* **No Dynamic Command Flags:** Never allow web pages or extension messages to inject arbitrary command-line flags into `aria2c`.
* **Path Traversal Defense:**
  * Resolve all paths with `path.resolve()` and `path.normalize()`.
  * Forbid relative traversal (`../` or `..\`).
  * Strip null bytes (`\0`) and invalid control characters.
  * Verify that output directories match user-approved storage paths configured in settings.
* **Filename Sanitization:**
  * Strip directory separators (`/`, `\`) from incoming suggested filenames.
  * Strip reserved Windows file names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
  * Reject empty filenames or names longer than 255 bytes.

---

## Header & Cookie Forwarding Policy

Web authentication context must be forwarded conservatively to avoid credential leakage:

1. **Scoped Cookies Only:**
   * Never dump or forward the full browser cookie store.
   * Query `chrome.cookies.getAll` strictly using the exact target download URL domain and path.
   * Assemble a clean `Cookie: name=val; ...` string and send only if the user has enabled authentication forwarding.
2. **Allowed Headers Only:**
   * Only forward explicitly safe navigation headers: `User-Agent`, `Referer`, and `Cookie`.
   * Never forward the `Authorization` header automatically.
3. **Signed URLs:**
   * URLs with embedded security parameters (`?token=...`, `?signature=...`, `?auth=...`) must never be written to plaintext log files or exposed via diagnostics.
   * Strip sensitive query parameters before rendering download URLs in the history UI.

---

## aria2 RPC Isolation

* `aria2c` must strictly bind to `127.0.0.1` (`--rpc-listen-all=false`).
* A cryptographically secure random token (`crypto.randomBytes(32).toString('hex')`) is generated on native host startup to serve as the RPC secret.
* The secret is kept entirely in-memory within the native host. The browser extension never receives or needs this secret directly.