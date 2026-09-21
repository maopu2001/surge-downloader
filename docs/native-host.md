# Native Host Specification & Packaging

## Native Messaging Framing

The browser extension and native host communicate via `stdin` and `stdout` using Chromium's 32-bit length-prefixed framing:

* **Prefix:** 4 bytes representing the length of the JSON payload as an unsigned 32-bit integer in native byte order.
* **Payload:** UTF-8 encoded JSON string (maximum 1 MB).

```
+---------------------------+---------------------------------------+
| Length (4 bytes, uint32)  | JSON Payload (UTF-8, `Length` bytes)  |
+---------------------------+---------------------------------------+
```

Framing logic is centralized in `apps/native-host/src/protocol/codec.ts`. Raw streams must not be parsed arbitrarily in other modules.

---

## Native Host Manifest

The manifest registers the executable with the browser. It must use an explicit absolute path and restrict access strictly to the extension ID:

```json
{
  "name": "com.aria2.browser.host",
  "description": "Aria2 Browser Native Messaging Host",
  "path": "/usr/local/bin/aria2-browser-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXPLICIT_EXTENSION_ID/"
  ]
}
```

*Wildcard origins (`"*"`) are strictly prohibited.*

### Platform Registration Targets

* **macOS:** `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.aria2.browser.host.json`
* **Linux:** `~/.config/google-chrome/NativeMessagingHosts/com.aria2.browser.host.json`
* **Windows:** Registry key `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.aria2.browser.host` pointing to the JSON manifest path.

---

## Node Single Executable Application (SEA)

To deploy without requiring a pre-installed Node.js runtime on the user machine, build with Node 26 SEA:

1. **Compile & Bundle:**
   ```bash
   pnpm --filter @aria2-browser/native-host build
   # Outputs a single bundled file: dist/bundle.cjs
   ```
2. **Generate Blob:**
   Configure `sea-config.json`:
   ```json
   {
     "main": "dist/bundle.cjs",
     "output": "dist/sea-prep.blob",
     "disableExperimentalSEAWarning": true
   }
   ```
   Execute the blob generator:
   ```bash
   node --build-sea sea-config.json
   ```
3. **Inject Binary:**
   * Copy the target Node 26 binary (e.g., `cp $(which node) bin/aria2-browser-host`).
   * Remove binary signatures on macOS (`codesign --remove-signature bin/aria2-browser-host`).
   * Inject blob using `postject`:
     ```bash
     npx postject bin/aria2-browser-host NODE_SEA_BLOB dist/sea-prep.blob \
       --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
       --macho-segment-name NODE_SEA
     ```
   * Re-sign the executable on macOS/Windows.

---

## Process Lifecycle Management

* The host checks for an existing `aria2c` RPC instance on `127.0.0.1:6800`.
* If not present, the host spawns `aria2c` with structured arguments:
  ```typescript
  spawn("aria2c", [
    "--enable-rpc=true",
    "--rpc-listen-all=false",
    "--rpc-listen-port=6800",
    `--rpc-secret=${sessionSecret}`,
    "--quiet=true"
  ]);
  ```
* When the Native Messaging channel closes (`stdin` receives EOF), the host gracefully stops `aria2c` (if spawned by this process) and terminates cleanly.