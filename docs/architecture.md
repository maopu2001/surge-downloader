# Architecture & State Management

## Core Responsibilities

```
┌──────────────────────────────────────────────┐
│          Browser Extension (MV3)             │
│  - Detects downloads via chrome.downloads    │
│  - Applies deterministic interception rules  │
│  - User interface (Popup, Dashboard, Prompt) │
│  - Never runs its own download engine        │
└──────────────────────┬───────────────────────┘
                       │ Native Messaging (stdio)
                       ▼
┌──────────────────────────────────────────────┐
│            Node.js Native Host               │
│  - Manages & spawns aria2c process           │
│  - Validates all boundaries (JSON Schema)    │
│  - Normalizes JSON-RPC to extension messages │
│  - Shields OS and filesystem boundaries      │
└──────────────────────┬───────────────────────┘
                       │ Localhost JSON-RPC (:6800)
                       ▼
┌──────────────────────────────────────────────┐
│                    aria2c                    │
│  - HTTP/HTTPS, FTP, BitTorrent, Metalink     │
│  - Multi-connection downloading & resume     │
│  - Queueing, throttling, and disk writes     │
└──────────────────────────────────────────────┘
```

---

## State Transition Model

Never cancel the browser download prior to positive confirmation from `aria2c`. Transitions must follow this deterministic flow:

```
[BROWSER_CREATED]
       │
       ▼
   [FILTERED]
       │
       ├── (Excluded / OFF mode) ────────────► [BROWSER_ACTIVE]
       │
       └── (Eligible / AUTO / ASK Accepted)
               │
               ▼
       [HANDOFF_PENDING]
               │
       ┌───────┴───────────────────────┐
       ▼ (RPC returns GID)             ▼ (Host or RPC fails)
 [ARIA2_ADDED]                   [BROWSER_FALLBACK]
       │                         (Browser download preserved)
       ▼
 [BROWSER_CANCEL_PENDING]
       │
       ▼
 [ARIA2_ACTIVE]
       │
       ▼
 [ARIA2_COMPLETED]
```

---

## Download Binding Record

The extension maintains only the metadata needed to correlate browser tasks to native downloads:

```typescript
export interface DownloadBinding {
  browserId: number;
  gid: string;
  state:
    | "browser-active"
    | "handoff-pending"
    | "aria2-added"
    | "browser-cancel-pending"
    | "aria2-active"
    | "completed"
    | "failed"
    | "cancelled";
  url: string;
  filename: string;
  totalBytes: number;
  receivedBytes: number;
  speed: number;
  createdAt: number;
  updatedAt: number;
}
```

---

## Service Worker Resilience

Manifest V3 background service workers may be terminated at any time.

* Never store long-term state solely in in-memory JavaScript variables.
* Persist operational preferences and active binding IDs in `chrome.storage.local`.
* Upon service worker wake-up, the extension sends a `download.sync` request to the Native Host to reconcile state against active `aria2c` tasks (`aria2.tellActive`, `aria2.tellWaiting`, `aria2.tellStopped`).