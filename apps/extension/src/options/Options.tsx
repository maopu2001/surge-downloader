import React, { useEffect, useState } from "react";
import type {
  ExtensionSettings,
  InterceptionMode,
} from "@aria2-browser/protocol";
import { DEFAULT_SETTINGS } from "@aria2-browser/protocol";
import { useSystemTheme } from "../utils/useTheme.js";
import {
  CheckCircle,
  AlertCircle,
  Activity,
  Save,
  RotateCcw,
  Shield,
  Folder,
  Layers,
  Globe,
  Trash2,
  Check,
  Copy,
  PlayCircle,
  Sliders,
  FolderTree,
  Network,
  Plus,
  HelpCircle,
} from "lucide-react";

export function Options() {
  useSystemTheme();
  const [settings, setSettings] = useState<ExtensionSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [loading, setLoading] = useState(true);
  const [savedMessage, setSavedMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [testingHealth, setTestingHealth] = useState(false);

  // OS Detection & Installer helper state
  const detectDefaultOS = () => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "macos";
    if (ua.includes("win")) return "windows";
    if (ua.includes("arch")) return "arch";
    if (ua.includes("fedora") || ua.includes("rhel")) return "fedora";
    return "ubuntu";
  };
  const [selectedOS, setSelectedOS] = useState<string>(detectDefaultOS());
  const [copiedKey, setCopiedKey] = useState<string>("");

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  // Form input string states (comma or newline separated)
  const [incExtStr, setIncExtStr] = useState("");
  const [excExtStr, setExcExtStr] = useState("");
  const [incDomStr, setIncDomStr] = useState("");
  const [excDomStr, setExcDomStr] = useState("");

  const loadSettings = () => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
      if (res?.success && res.data) {
        const loaded = { ...DEFAULT_SETTINGS, ...res.data };
        setSettings(loaded);
        setIncExtStr(loaded.includedExtensions.join(", "));
        setExcExtStr(loaded.excludedExtensions.join(", "));
        setIncDomStr(loaded.includedDomains.join(", "));
        setExcDomStr(loaded.excludedDomains.join(", "));
      }
      setLoading(false);
    });
  };

  const runDiagnostics = () => {
    setTestingHealth(true);
    chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (res) => {
      setTestingHealth(false);
      if (res?.success) {
        setDiagnostics(res.data);
      }
    });
  };

  useEffect(() => {
    loadSettings();
    runDiagnostics();
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const parseList = (str: string) =>
      str
        .split(/[,\n]/)
        .map((s) => s.trim().replace(/^\./, ""))
        .filter(Boolean);

    const updated: ExtensionSettings = {
      ...settings,
      includedExtensions: parseList(incExtStr),
      excludedExtensions: parseList(excExtStr),
      includedDomains: parseList(incDomStr),
      excludedDomains: parseList(excDomStr),
    };

    chrome.runtime.sendMessage(
      { type: "UPDATE_SETTINGS", payload: updated },
      (res) => {
        if (res?.success) {
          setSettings(res.data);
          setSavedMessage("Settings saved successfully!");
          setTimeout(() => setSavedMessage(""), 3000);
        }
      },
    );
  };

  const handleResetDefaults = () => {
    if (confirm("Reset all settings to default values?")) {
      chrome.runtime.sendMessage(
        { type: "UPDATE_SETTINGS", payload: DEFAULT_SETTINGS },
        (res) => {
          if (res?.success) {
            setSettings(res.data);
            setIncExtStr(res.data.includedExtensions.join(", "));
            setExcExtStr(res.data.excludedExtensions.join(", "));
            setIncDomStr(res.data.includedDomains.join(", "));
            setExcDomStr(res.data.excludedDomains.join(", "));
            setSavedMessage("Reset to default settings.");
            setTimeout(() => setSavedMessage(""), 3000);
          }
        },
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-950">
        <Activity className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans py-10 px-6 transition-colors duration-200">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <img
              src="/icons/icon-48.png"
              alt="Surge"
              className="w-10 h-10 rounded-xl shadow-sm"
            />
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Surge Settings
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Configure interception rules, download directories, and system
                diagnostics.
              </p>
            </div>
          </div>
          {savedMessage && (
            <div className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-semibold rounded-lg shadow-sm border border-emerald-300 dark:border-emerald-800 animate-fade-in">
              {savedMessage}
            </div>
          )}
        </div>

        {/* Diagnostics & Health Check Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-sky-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                System Diagnostics & Health Check
              </h2>
            </div>
            <button
              type="button"
              onClick={runDiagnostics}
              disabled={testingHealth}
              className="px-3 py-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 rounded-lg border border-sky-200 dark:border-sky-800 transition-colors"
            >
              {testingHealth ? "Testing..." : "Re-test Connection"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Extension Service Worker
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Manifest V3 Active
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl">
              <div className="flex items-center space-x-2">
                {diagnostics.nativeHost?.ok ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                )}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Native Messaging Host
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                {diagnostics.nativeHost?.message || "Not tested"}
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl">
              <div className="flex items-center space-x-2">
                {diagnostics.aria2c?.ok ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  aria2c Daemon / RPC
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                {diagnostics.aria2c?.message || "Waiting for native host"}
              </p>
            </div>
          </div>

          {/* Setup / Installation Guide if disconnected */}
          {(!diagnostics.aria2c?.ok || !diagnostics.nativeHost?.ok) && (
            <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-2xl p-5 space-y-4 shadow-sm animate-fade-in">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Setup Required: Install aria2c & Register Native Host
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Surge requires{" "}
                    <code className="font-mono font-semibold">aria2c</code> on
                    your system to download files. Follow the steps below for
                    your OS:
                  </p>
                </div>
              </div>

              {/* OS Tabs */}
              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap gap-1.5 border-b border-amber-200 dark:border-amber-900/60 pb-2">
                  {[
                    { id: "macos", label: "macOS (Homebrew)" },
                    { id: "windows", label: "Windows (winget)" },
                    { id: "ubuntu", label: "Ubuntu / Debian" },
                    { id: "fedora", label: "Fedora / RHEL" },
                    { id: "arch", label: "Arch Linux" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedOS(tab.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                        selectedOS === tab.id
                          ? "bg-amber-500 text-white shadow-sm"
                          : "bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-slate-700 border border-amber-200 dark:border-slate-700"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Step 1: Install command */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                      1
                    </span>
                    <span>Install aria2c via Terminal / PowerShell:</span>
                  </span>
                  <div className="flex items-center justify-between bg-slate-900 text-slate-100 p-2.5 rounded-xl font-mono text-xs shadow-inner">
                    <span className="select-all">
                      {selectedOS === "macos" && "brew install aria2"}
                      {selectedOS === "windows" && "winget install aria2.aria2"}
                      {selectedOS === "ubuntu" &&
                        "sudo apt update && sudo apt install aria2"}
                      {selectedOS === "fedora" && "sudo dnf install aria2"}
                      {selectedOS === "arch" && "sudo pacman -S aria2"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const cmd =
                          selectedOS === "macos"
                            ? "brew install aria2"
                            : selectedOS === "windows"
                              ? "winget install aria2.aria2"
                              : selectedOS === "ubuntu"
                                ? "sudo apt update && sudo apt install aria2"
                                : selectedOS === "fedora"
                                  ? "sudo dnf install aria2"
                                  : "sudo pacman -S aria2";
                        copyToClipboard(cmd, "install-cmd");
                      }}
                      className="ml-3 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition-colors flex-shrink-0"
                    >
                      {copiedKey === "install-cmd" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Step 2: Register native host */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                      2
                    </span>
                    <span>
                      Register Native Messaging Host manifest with Chromium:
                    </span>
                  </span>
                  <div className="flex items-center justify-between bg-slate-900 text-slate-100 p-2.5 rounded-xl font-mono text-xs shadow-inner">
                    <span className="select-all">
                      {selectedOS === "windows"
                        ? ".\\install-host.bat"
                        : "./install-host.sh"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const cmd =
                          selectedOS === "windows"
                            ? ".\\install-host.bat"
                            : "./install-host.sh";
                        copyToClipboard(cmd, "register-cmd");
                      }}
                      className="ml-3 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition-colors flex-shrink-0"
                    >
                      {copiedKey === "register-cmd" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Step 3: Re-test */}
                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={runDiagnostics}
                    disabled={testingHealth}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
                  >
                    <Activity className="w-4 h-4" />
                    <span>
                      {testingHealth
                        ? "Testing Connection..."
                        : "Check Status (Re-test)"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Configuration Form */}
        <form onSubmit={handleSave} className="space-y-6">
          {/* Mode Selection */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-sky-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Interception Mode
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  {
                    id: "auto",
                    name: "Automatic (AUTO)",
                    desc: "Instantly offload matching downloads to aria2c. Fall back to browser on error.",
                  },
                  {
                    id: "ask",
                    name: "Prompt (ASK)",
                    desc: "Pause browser download and ask user: aria2c or browser for each match.",
                  },
                  {
                    id: "off",
                    name: "Disabled (OFF)",
                    desc: "Never intercept. All downloads proceed through standard Chromium engine.",
                  },
                ] as const
              ).map((mode) => (
                <label
                  key={mode.id}
                  className={`p-4 border rounded-xl cursor-pointer transition-all ${
                    settings.mode === mode.id
                      ? "border-sky-500 bg-sky-50/50 dark:bg-sky-950/40 dark:border-sky-500 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="mode"
                      value={mode.id}
                      checked={settings.mode === mode.id}
                      onChange={() =>
                        setSettings({
                          ...settings,
                          mode: mode.id as InterceptionMode,
                        })
                      }
                      className="text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {mode.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {mode.desc}
                  </p>
                </label>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.interceptAll}
                  onChange={(e) =>
                    setSettings({ ...settings, interceptAll: e.target.checked })
                  }
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Intercept All File Downloads (Catch-All)
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    When enabled, offloads every file download without requiring
                    matching file extensions (except excluded
                    domains/extensions).
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Rules: Extensions & Domains */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center space-x-2">
              <Globe className="w-5 h-5 text-sky-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Interception Rules & Filters
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target File Extensions (Included)
                </label>
                <textarea
                  rows={3}
                  value={incExtStr}
                  onChange={(e) => setIncExtStr(e.target.value)}
                  placeholder="iso, zip, tar.gz, mp4, 7z..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Comma-separated list of extensions.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Excluded File Extensions
                </label>
                <textarea
                  rows={3}
                  value={excExtStr}
                  onChange={(e) => setExcExtStr(e.target.value)}
                  placeholder="crx, pdf..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Excluded extensions bypass aria2 even if matching inclusion
                  rules.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Included Domains
                </label>
                <textarea
                  rows={2}
                  value={incDomStr}
                  onChange={(e) => setIncDomStr(e.target.value)}
                  placeholder="downloads.example.org, releases.ubuntu.com..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Always intercept downloads from these domains.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Excluded Domains
                </label>
                <textarea
                  rows={2}
                  value={excDomStr}
                  onChange={(e) => setExcDomStr(e.target.value)}
                  placeholder="*.internal.net, localhost..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Never intercept downloads from these domains.
                </p>
              </div>
            </div>
          </div>

          {/* Storage Directory */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center space-x-2">
              <Folder className="w-5 h-5 text-sky-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Output Directory
              </h2>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Custom Download Directory (Optional)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    chrome.runtime.sendMessage(
                      {
                        type: "SELECT_FOLDER",
                        payload: {
                          defaultPath:
                            settings.downloadDirectory.trim() || undefined,
                        },
                      },
                      (res) => {
                        if (
                          res?.success &&
                          res.data?.path &&
                          !res.data.canceled
                        ) {
                          setSettings((prev) => ({
                            ...prev,
                            downloadDirectory: res.data.path,
                          }));
                        }
                      },
                    );
                  }}
                  className="px-2.5 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900 border border-sky-200 dark:border-sky-800 rounded-lg transition-colors flex items-center space-x-1"
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>Choose Folder (OS)</span>
                </button>
              </div>
              <input
                type="text"
                value={settings.downloadDirectory}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    downloadDirectory: e.target.value,
                  })
                }
                placeholder="Leave blank to use OS default ~/Downloads"
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-900 dark:text-slate-100"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Must be an absolute path on your filesystem where aria2c has
                write permissions.
              </p>
            </div>
          </div>

          {/* Security & Header Forwarding */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-sky-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Security & Authentication Forwarding
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.forwardCookies}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      forwardCookies: e.target.checked,
                    })
                  }
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Forward Domain-Scoped Cookies
                  </span>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Sends strictly the cookies matching the exact download URL
                    to aria2c for authenticated downloads.
                  </p>
                </div>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.forwardUserAgent}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      forwardUserAgent: e.target.checked,
                    })
                  }
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Forward Browser User-Agent
                  </span>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Imitates browser navigation headers so CDN download servers
                    don't block aria2c.
                  </p>
                </div>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.forwardReferer}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      forwardReferer: e.target.checked,
                    })
                  }
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Forward Referer Header
                  </span>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Passes the initiating page URL to satisfy anti-hotlinking
                    protections.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Aria2 Engine & Connection Defaults */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center space-x-2">
              <Sliders className="w-5 h-5 text-sky-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Aria2 Connection & Engine Defaults
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Default Split / Connections per File (1–16)
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="range"
                    min="1"
                    max="16"
                    value={settings.defaultSplit}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setSettings({
                        ...settings,
                        defaultSplit: val,
                        defaultMaxConnectionPerServer: val,
                      });
                    }}
                    className="flex-1 accent-sky-500"
                  />
                  <span className="w-8 font-mono font-bold text-slate-800 dark:text-slate-200 text-sm">
                    {settings.defaultSplit}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Controls aria2 `split` and `max-connection-per-server`.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Min Split Size
                </label>
                <input
                  type="text"
                  value={settings.defaultMinSplitSize}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultMinSplitSize: e.target.value,
                    })
                  }
                  placeholder="e.g. 10M, 20M"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Aria2 only splits file when size exceeds this value (e.g.
                  10M).
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Max Download Limit (Speed Limit)
                </label>
                <input
                  type="text"
                  value={settings.defaultMaxDownloadLimit}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultMaxDownloadLimit: e.target.value,
                    })
                  }
                  placeholder="0 for unlimited, or e.g. 2M, 500K"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Aria2 `max-download-limit`. Set 0 for unlimited speed.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Default Proxy Server (Optional)
                </label>
                <input
                  type="text"
                  value={settings.defaultProxy}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultProxy: e.target.value })
                  }
                  placeholder="e.g. socks5://127.0.0.1:1080 or http://127.0.0.1:8080"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Supports http, https, and socks5 proxy schemes.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.defaultCheckCertificate}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultCheckCertificate: e.target.checked,
                    })
                  }
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Verify SSL/TLS Certificates (`check-certificate`)
                </span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoFileRenaming}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      autoFileRenaming: e.target.checked,
                    })
                  }
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Auto-Rename Duplicates (`auto-file-renaming`)
                </span>
              </label>
            </div>
          </div>

          {/* Smart Sub-Directory Routing */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FolderTree className="w-5 h-5 text-sky-500" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Smart Sub-Folder Routing
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSettings({
                    ...settings,
                    subDirectoryRouting: [
                      ...(settings.subDirectoryRouting || []),
                      { pattern: "", subDirectory: "" },
                    ],
                  });
                }}
                className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 rounded-lg border border-sky-200 dark:border-sky-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Routing Rule</span>
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automatically route downloaded files into sub-directories based on
              extensions or MIME patterns.
            </p>

            <div className="space-y-2 text-xs">
              {(settings.subDirectoryRouting || []).map((route, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={route.pattern}
                    onChange={(e) => {
                      const updated = [...(settings.subDirectoryRouting || [])];
                      updated[idx] = {
                        ...updated[idx],
                        pattern: e.target.value,
                      };
                      setSettings({
                        ...settings,
                        subDirectoryRouting: updated,
                      });
                    }}
                    placeholder="Pattern (e.g. iso,dmg or video/*)"
                    className="flex-1 p-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-slate-400 font-mono">→</span>
                  <input
                    type="text"
                    value={route.subDirectory}
                    onChange={(e) => {
                      const updated = [...(settings.subDirectoryRouting || [])];
                      updated[idx] = {
                        ...updated[idx],
                        subDirectory: e.target.value,
                      };
                      setSettings({
                        ...settings,
                        subDirectoryRouting: updated,
                      });
                    }}
                    placeholder="Sub-folder (e.g. ISOs)"
                    className="w-48 p-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (
                        settings.subDirectoryRouting || []
                      ).filter((_, i) => i !== idx);
                      setSettings({
                        ...settings,
                        subDirectoryRouting: updated,
                      });
                    }}
                    className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>

            <button
              type="submit"
              className="inline-flex items-center space-x-2 px-6 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 rounded-xl shadow-sm transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Save Configuration</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
