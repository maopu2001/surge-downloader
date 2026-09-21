# Download Interception & Rules Engine

## Detection Flow

Interception starts at `chrome.downloads.onCreated`:

```
chrome.downloads.onCreated(downloadItem)
               │
               ▼
Extract metadata (URL, Filename, MIME, Domain)
               │
               ▼
Match against Rule Precedence Chain
               │
       ┌───────┴───────────────────────┐
       ▼                               ▼
Interception Triggered            Ignored / Bypass
       │                               │
       ├──────────────┐                ▼
[AUTO Mode]      [ASK Mode]     Let browser download proceed
       │              │
       │         Prompt user
       │         [aria2] vs [Browser]
       ▼              │
Dispatch to      (If aria2)
Native Host ◄────┘
```

---

## Interception Modes

1. **OFF:**
   * Extension never intercepts. All downloads stay in the browser.
2. **ASK:**
   * Browser download is paused or allowed to start while a minimal prompt is shown.
   * If the user selects **Use aria2**, the download is dispatched to the native host; on success, the browser download is cancelled.
   * If the user selects **Browser**, the browser download continues uninterrupted.
3. **AUTO:**
   * Downloads matching the rule set are immediately handed over to `aria2c`.
   * The browser download is cancelled only after `aria2.addUri` returns a valid `gid`.

---

## Rule Precedence Order

Rules are evaluated deterministically in the following top-to-bottom sequence:

1. **Global Mode Disabled (`OFF`):** Retain browser download.
2. **Restricted Protocols:** URLs matching `blob:`, `data:`, `chrome:`, `chrome-extension:`, `about:`, `javascript:` are immediately ignored.
3. **Domain Excluded:** Host matches user exclusion list (e.g., `*.internal.net`) → Retain browser download.
4. **Extension Excluded:** File extension matches exclusion list (e.g., `.crx`, `.pdf`) → Retain browser download.
5. **Domain Explicitly Included:** Host matches inclusion list → Intercept.
6. **Extension Explicitly Included:** Extension matches target list (e.g., `.iso`, `.zip`, `.tar.gz`, `.mp4`) → Intercept.
7. **MIME Type Match:** `mimeType` matches configured pattern (e.g., `application/x-iso9660-image`, `video/*`) → Intercept.
8. **Default Action:** If no specific rules match, fall back to default behavior defined for the active mode.

---

## Default Interception File Extensions

```typescript
export const DEFAULT_INTERCEPT_EXTENSIONS = [
  // Archives
  "zip", "tar", "tar.gz", "tgz", "7z", "rar", "bz2", "xz",
  // Disk Images
  "iso", "dmg", "img", "vhd",
  // Installers / Packages
  "exe", "msi", "apk", "deb", "rpm", "pkg",
  // Media
  "mp4", "mkv", "avi", "flv", "mov", "mp3", "flac", "wav"
];
```

*Users can customize, extend, or clear this list in Extension Options.*