# Diagnostics & Quality Assurance

## Health Check Panel

The extension's options page and popup contain a self-diagnostics view testing all components in the chain:

```
Component        Status   Details
──────────────────────────────────────────────────────────
Extension SW     [ OK ]   Manifest V3 active
Native Host      [ OK ]   Ping/Pong latency: 12ms
aria2c Binary    [ OK ]   v1.37.0 detected at /usr/bin/aria2c
JSON-RPC         [ OK ]   127.0.0.1:6800 connected
Download Folder  [ OK ]   /Users/user/Downloads (Writable)
```

---

## Fallback & Failure Verification Matrix

Verify the following failure paths manually or via integration tests:

| Failure Mode | Test Action | Expected Result |
|---|---|---|
| **Native Host Missing** | Unregister or move host binary | Browser download remains active; UI indicates host offline. |
| **aria2c Absent** | Terminate or uninstall `aria2c` | Extension retains browser download; notifies user that engine is missing. |
| **RPC Refusal** | Invalidate the RPC secret token | Host fails the handoff; browser continues the original download. |
| **Service Worker Idle** | Terminate SW via `chrome://serviceworker-internals` | SW restarts on download event, executes `download.sync`, recovers bindings. |
| **Malformed Message** | Inject invalid JSON directly over stdio | Host rejects message with `INVALID_MESSAGE` without crashing. |
| **Path Traversal** | Request download path `../../etc/cron.d` | Host rejects with `INVALID_DIRECTORY`; browser download untouched. |

---

## End-to-End Acceptance Test Flow

Prior to finalizing any release, complete this end-to-end verification sequence:

1. **Clean Installation:** Register host manifest using platform registration script and load unpacked extension into Chromium.
2. **Diagnostic Confirmation:** Open popup and verify all five health checks pass.
3. **Interception Test:**
   * Navigate to a public test file (e.g., an Ubuntu minimal ISO).
   * Click download.
   * Verify `chrome.downloads` triggers handoff.
   * Verify `aria2c` begins chunking the download in the specified folder.
   * Verify browser download item shows cancelled or cleanly superseded.
4. **Download Management:**
   * Click **Pause** in the extension popup; confirm `aria2c` speed drops to 0.
   * Click **Resume**; confirm speed recovers.
5. **Completion:**
   * Wait for completion.
   * Verify file hash matches source checksum.
   * Verify notification is dispatched.