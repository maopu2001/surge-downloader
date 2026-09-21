# AGENTS.md — Agent & Contributor Directives

Desktop-focused Chromium extension that offloads downloads to a local `aria2c` instance via a Node.js Native Messaging host.

## System Topology
```
Browser Extension (TypeScript / React / MV3 / Tailwind)
        ↓ Native Messaging (length-prefixed stdio JSON)
Node.js 26 Native Host (TypeScript / Node SEA standalone)
        ↓ JSON-RPC (http://127.0.0.1:6800/jsonrpc + secret)
aria2c Engine
        ↓
Local Disk
```

## Hard Constraints & Agent Boundaries
* **Strict Runtime & Engine:** Strictly no Rust, WASM, Bun, Deno, Python, Electron, Tauri, or cloud/backend servers. Node.js `>=26.9.0 <27` pinned across all packages.
* **Handoff Guarantee:** Never cancel a browser download before `aria2c` accepts the job and returns an active GID. Keep the browser download alive on any failure.
* **Security Isolation:** The Native Host is a security boundary. Never invoke a shell, never expose aria2 RPC beyond `127.0.0.1`, and never log or persist secrets, authorization tokens, or cookies.
* **No Custom Downloader:** All download streaming, chunking, queuing, and disk writes belong strictly to `aria2c`.

## Documentation Directory (`/docs`)
Consult the relevant specification before implementing features or modifying logic:

| Area | Document | Focus |
|---|---|---|
| **Architecture & State** | [`docs/architecture.md`](docs/architecture.md) | Component roles, data flows, and state machine transitions |
| **Native Host & Packaging** | [`docs/native-host.md`](docs/native-host.md) | Stdio framing, SEA build flow, OS manifests, and lifecycle |
| **Protocol Specification** | [`docs/protocol.md`](docs/protocol.md) | Message envelopes, schemas, request/response pairs, error codes |
| **Interception & Rules** | [`docs/interception-rules.md`](docs/interception-rules.md) | `chrome.downloads` hook, OFF/ASK/AUTO modes, rule evaluation order |
| **Security & Auth** | [`docs/security.md`](docs/security.md) | Path sanitization, header/cookie scoping, secret isolation |
| **Development & Setup** | [`docs/development.md`](docs/development.md) | Monorepo layout, pnpm setup, build scripts, milestone plan |
| **Diagnostics & QA** | [`docs/diagnostics.md`](docs/diagnostics.md) | Health checks, edge case testing, and end-to-end scenarios |

## Standard Agent Workflow
1. **Identify the Scope:** Limit modifications to the target package (`apps/extension`, `apps/native-host`, or `packages/protocol`).
2. **Schema First:** If protocol changes are required, update `packages/protocol` first and synchronize validation across both endpoints.
3. **Trace Failures:** Follow the diagnostic path: Browser Event → Rule Match → Native Protocol → Validation → aria2 RPC → GID → Cancellation.
4. **Commit Format:** Use concise conventional commit messages (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).