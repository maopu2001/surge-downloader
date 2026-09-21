# Surge — High-Speed aria2c Download Manager for Chromium

A desktop-focused Chromium extension that offloads downloads to a local `aria2c` instance via a Node.js Native Messaging host for multi-stream acceleration, smart rule interception, and complete download lifecycle management.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_26-43853D?style=flat-square&logo=node.js&logoColor=white)
![Aria2](https://img.shields.io/badge/Engine-aria2c-blue?style=flat-square)

---

## ⚡ Key Capabilities

* **Multi-Connection Downloading** — Offload browser downloads to `aria2c` with configurable chunk splitting (1–16 connections) for maximum throughput.
* **Flexible Interception Modes**:
  * **AUTO** — Seamlessly intercept matching downloads based on file extensions or domain lists.
  * **ASK** — Interception modal dialog with folder picker, split count override, and checksum validation.
  * **OFF** — Pass all downloads to standard browser handling.
* **Smart Handoff Guarantee** — Never cancels browser downloads until aria2c confirms an active GID.
* **Dynamic CDN Link Renewal** — Update expired temporary URLs or CDN tokens directly from Dashboard/Popup and resume without restarting from byte 0.
* **Native OS Integration** — Zero-config native host manages aria2 daemon, RPC secret isolation, and native "Reveal in Folder" actions.
* **Full-Featured Dashboard & Quick Popup** — Live speeds, active ETA, batch actions (Pause All / Resume All / Clear Finished), and dark/light adaptive theming.

---

## 🏗️ Architecture

```
Browser Extension (React 19 / MV3 / Tailwind)
        ↓ Native Messaging (length-prefixed stdio JSON)
Node.js Native Host (TypeScript standalone)
        ↓ JSON-RPC (http://127.0.0.1:6800/jsonrpc + secret)
aria2c Engine
        ↓
Local Disk
```

---

## 📦 Quick Installation (1-Click Bundle)

1. Download **`surge-v1.0.0-installer.zip`** or the latest release from [Releases](https://github.com/maopu2001/downloader/releases).
2. Extract the archive.
3. Run the installer:
   * **macOS / Linux**: `./setup.sh`
   * **Windows**: `setup.bat`
4. In Chrome/Brave/Edge, open `chrome://extensions/` -> Enable **Developer mode** -> Click **Load unpacked** -> Select the `extension` folder.

---

## 🛠️ Development & Building from Source

### Prerequisites
* **Node.js**: `>=26.0.0`
* **pnpm**: `>=9.0.0`
* **aria2**: `brew install aria2` / `winget install aria2.aria2` / `sudo apt install aria2`

### Setup
```bash
# Clone repository
git clone https://github.com/maopu2001/downloader.git
cd downloader

# Install monorepo dependencies
pnpm install

# Typecheck and run test suites
pnpm run typecheck
pnpm run test
```

### Build Everything
```bash
# Build protocol, extension, and native host
pnpm run build

# Package complete 1-click release installer bundle
pnpm run package
```

The unified installer archive will be generated in `release/surge-v1.0.0-installer.zip`.

---

## 👨‍💻 Author

* **M. Aktaruzzaman Opu**
* **GitHub**: [@maopu2001](https://github.com/maopu2001)
* **Portfolio**: [maopu.com.bd](https://maopu.com.bd)

---

## 📄 License

MIT License.
