# Protocol & Message Specifications

All communication between the Extension and Native Host uses a standard envelope with versioning, message types, and UUID-based request tracking.

## Standard Envelope

```typescript
export interface ProtocolEnvelope<T = unknown> {
  protocolVersion: 1;
  type: string;
  requestId?: string; // Required for all request/response pairs
  payload: T;
}
```

---

## Extension → Native Host Messages

### 1. `ping`
Heartbeat check to verify the native bridge is alive.
* **Payload:** `{}`

### 2. `aria2.status`
Checks if `aria2c` is running and accessible via RPC.
* **Payload:** `{}`

### 3. `download.add`
Submits an intercepted download to `aria2c`.
* **Payload:**
  ```typescript
  {
    url: string;
    filename?: string;
    directory?: string;
    headers?: {
      referer?: string;
      userAgent?: string;
      cookie?: string;
    };
  }
  ```

### 4. `download.pause` / `download.resume` / `download.cancel`
Controls active download tasks.
* **Payload:**
  ```typescript
  {
    gid: string;
  }
  ```

### 5. `download.sync`
Requests all current active, waiting, and stopped downloads to rebuild the extension's UI state.
* **Payload:** `{}`

---

## Native Host → Extension Messages

### 1. `pong`
* **Payload:** `{ timestamp: number }`

### 2. `aria2.ready`
Emitted when `aria2c` process is verified and ready for RPC calls.
* **Payload:** `{ version: string; port: number }`

### 3. `download.added`
Acknowledges successful submission of a download to `aria2c`.
* **Payload:**
  ```typescript
  {
    gid: string;
    url: string;
  }
  ```

### 4. `download.progress`
Streaming progress update from aria2 polling.
* **Payload:**
  ```typescript
  {
    gid: string;
    status: "active" | "waiting" | "paused" | "error" | "complete" | "removed";
    completedBytes: number;
    totalBytes: number;
    downloadSpeed: number;
    uploadSpeed: number;
    etaSeconds?: number;
    errorMessage?: string;
  }
  ```

### 5. `error`
Standardized error structure.
* **Payload:**
  ```typescript
  {
    code: ErrorCode;
    message: string;
    details?: unknown;
  }
  ```

---

## Machine-Readable Error Codes

| Error Code | Meaning | Recovery Action |
|---|---|---|
| `INVALID_MESSAGE` | Schema validation failed on input | Abort request; log parsing failure |
| `INVALID_URL` | Forbidden scheme (`data:`, `blob:`, etc.) | Retain browser download |
| `INVALID_DIRECTORY` | Traversal detected or path not writable | Retain browser download; alert user |
| `ARIA2_UNAVAILABLE` | Process down or RPC port unreachable | Fall back to browser download |
| `ARIA2_ADD_FAILED` | `aria2.addUri` returned an RPC error | Fall back to browser download |
| `GID_NOT_FOUND` | Command referenced an invalid/expired GID | Re-sync download state via `download.sync` |