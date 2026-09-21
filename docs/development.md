# Development & Workspace Setup

## Prerequisites

* **Node.js:** `>=26.9.0 <27` (Enforced via `.nvmrc` and `engines` field in `package.json`).
* **pnpm:** `>=9.0.0`
* **aria2c:** Installed and discoverable in system `$PATH` (`brew install aria2`, `apt install aria2`, or `choco install aria2`).

---

## Monorepo Layout

```
aria2-browser/
├── apps/
│   ├── extension/          # Browser Extension (TypeScript, React, Tailwind, MV3)
│   │   ├── src/
│   │   │   ├── background/ # Service worker, download-interceptor, native-bridge
│   │   │   ├── popup/      # React popup UI
│   │   │   ├── dashboard/  # Full downloads management page
│   │   │   └── options/    # User settings and rule configuration
│   │   └── manifest.json
│   │
│   └── native-host/        # Node.js 26 Native Messaging Host
│       ├── src/
│       │   ├── protocol/   # Stdio framing codec & message validation
│       │   ├── aria2/      # RPC client and child process management
│       │   └── security/   # Filename sanitization and path verification
│       └── sea-config.json # Node SEA configuration
│
├── packages/
│   └── protocol/           # Shared TypeScript types, schemas, and error codes
│
├── scripts/                # Build, manifest install, and packaging scripts
├── docs/                   # Complete architecture and implementation specs
├── .nvmrc
├── pnpm-workspace.yaml
├── package.json
└── AGENTS.md
```

---

## Workspace Commands

```bash
# Install all dependencies across workspace
pnpm install

# Type-check all packages
pnpm typecheck

# Run linter
pnpm lint

# Run unit tests across extension, host, and protocol packages
pnpm test

# Build the extension in watch mode for browser testing
pnpm --filter @aria2-browser/extension dev

# Build the extension for production
pnpm --filter @aria2-browser/extension build

# Build the Native Host SEA binary
pnpm run build:native

# Register Native Messaging manifest for local development
pnpm run host:register
```

---

## Implementation Milestones

* **Milestone 0: Workspace Bootstrap** — Monorepo setup, TypeScript strict configurations, protocol package.
* **Milestone 1: Native Messaging PoC** — Stdio length-prefixed ping/pong between extension and Node host.
* **Milestone 2: aria2 Daemon Control** — Host spawns `aria2c`, manages RPC secret, verifies `aria2.addUri`.
* **Milestone 3: Download Detection** — Intercept `chrome.downloads.onCreated`, verify metadata extraction.
* **Milestone 4: Safe Handoff** — Successful handoff to `aria2c` followed by browser download cancellation.
* **Milestone 5: Progress & Controls** — Status synchronization, speed/ETA metrics, pause/resume/cancel.
* **Milestone 6: Popup & Dashboard** — React/Tailwind UI for quick inspection and full queue control.
* **Milestone 7: Packaging & Release** — Node SEA binary compilation and automated manifest installation.