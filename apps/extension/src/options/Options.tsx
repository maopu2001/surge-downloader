import React, { useEffect, useState } from "react";
import type {
  ExtensionSettings,
  InterceptionMode,
} from "@aria2-browser/protocol";
import { DEFAULT_SETTINGS } from "@aria2-browser/protocol";
import { useSystemTheme } from "../utils/useTheme.js";
import { Footer } from "../components/Footer.js";
import {
  CheckCircle2,
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
  Sliders,
  FolderTree,
  Plus,
  HelpCircle,
  Terminal,
  ExternalLink,
  Download,
} from "lucide-react";

type SettingsTab = "diagnostics" | "interception" | "storage" | "engine";

export function Options() {
  useSystemTheme();
  const [settings, setSettings] = useState<ExtensionSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [activeTab, setActiveTab] = useState<SettingsTab>("diagnostics");
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

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

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
          setSavedMessage("Settings saved successfully");
          setTimeout(() => setSavedMessage(""), 3000);
        }
      },
    );
  };

  const handleResetDefaults = () => {
    if (confirm("Reset all preferences to default values?")) {
      chrome.runtime.sendMessage(
        { type: "UPDATE_SETTINGS", payload: DEFAULT_SETTINGS },
        (res) => {
          if (res?.success) {
            setSettings(res.data);
            setIncExtStr(res.data.includedExtensions.join(", "));
            setExcExtStr(res.data.excludedExtensions.join(", "));
            setIncDomStr(res.data.includedDomains.join(", "));
            setExcDomStr(res.data.excludedDomains.join(", "));
            setSavedMessage("Reset to defaults");
            setTimeout(() => setSavedMessage(""), 3000);
          }
        },
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-zinc-400 bg-[#fafafa] dark:bg-[#09090b]">
        <Activity className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const isFullyConnected = diagnostics.nativeHost?.ok && diagnostics.aria2c?.ok;

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans antialiased flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-[#121215]/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">
                Surge Preferences
              </h1>
              <p className="text-[11px] text-zinc-500">
                Configure interception routing, aria2c engine defaults, and
                connection health
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {savedMessage && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center space-x-1 animate-fade-in mr-1">
                <Check className="w-3.5 h-3.5" />
                <span>{savedMessage}</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Defaults</span>
            </button>

            <button
              type="button"
              onClick={() => handleSave()}
              className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md shadow-xs transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>

            <button
              type="button"
              onClick={() => {
                chrome.tabs.create({
                  url: chrome.runtime.getURL("dashboard.html"),
                });
              }}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Open Dashboard"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-6 flex-1 w-full space-y-5">
        {/* Navigation Tabs */}
        <div className="inline-flex items-center space-x-1 bg-zinc-200/70 dark:bg-zinc-900/80 p-0.5 rounded-lg text-xs font-medium mb-5 self-start">
          {[
            { id: "diagnostics", label: "Diagnostics & Setup", icon: Activity },
            { id: "interception", label: "Interception & Rules", icon: Layers },
            { id: "storage", label: "Storage & Folders", icon: Folder },
            { id: "engine", label: "Engine & Network", icon: Sliders },
          ].map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center space-x-1.5 ${
                  active
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* TAB 1: DIAGNOSTICS & SETUP */}
          {activeTab === "diagnostics" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/80 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                      System Health & Status
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Verify communication between Chromium extension, Native
                      Host binary, and aria2c RPC.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={runDiagnostics}
                    disabled={testingHealth}
                    className="px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {testingHealth ? "Testing..." : "Re-test Connection"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Extension Worker */}
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Extension Worker
                      </span>
                    </div>
                    <p className="text-zinc-500 text-[11px] mt-1">
                      Manifest V3 Active
                    </p>
                  </div>

                  {/* Native Host */}
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-lg">
                    <div className="flex items-center space-x-2">
                      {diagnostics.nativeHost?.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      )}
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Native Host
                      </span>
                    </div>
                    <p
                      className="text-zinc-500 text-[11px] mt-1 truncate"
                      title={diagnostics.nativeHost?.message}
                    >
                      {diagnostics.nativeHost?.message || "Not checked"}
                    </p>
                  </div>

                  {/* aria2c daemon */}
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-lg">
                    <div className="flex items-center space-x-2">
                      {diagnostics.aria2c?.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        aria2c RPC Daemon
                      </span>
                    </div>
                    <p
                      className="text-zinc-500 text-[11px] mt-1 truncate"
                      title={diagnostics.aria2c?.message}
                    >
                      {diagnostics.aria2c?.message || "Waiting for host"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Setup Guide */}
              {!isFullyConnected && (
                <div className="bg-white dark:bg-[#121215] border border-amber-500/30 rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
                    <HelpCircle className="w-4 h-4 flex-shrink-0" />
                    <h3 className="font-semibold text-xs">
                      Setup Instructions (Install aria2c & Native Host)
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-1 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                    {[
                      { id: "macos", label: "macOS" },
                      { id: "windows", label: "Windows" },
                      { id: "ubuntu", label: "Ubuntu / Debian" },
                      { id: "fedora", label: "Fedora" },
                      { id: "arch", label: "Arch Linux" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedOS(tab.id)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                          selectedOS === tab.id
                            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Step 1 */}
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Step 1: Install aria2c
                    </span>
                    <div className="flex items-center justify-between bg-zinc-900 text-zinc-200 p-2 rounded-lg font-mono text-xs">
                      <span className="select-all truncate">
                        {selectedOS === "macos" && "brew install aria2"}
                        {selectedOS === "windows" &&
                          "winget install aria2.aria2"}
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
                        className="ml-2 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[10px] font-sans flex items-center space-x-1"
                      >
                        {copiedKey === "install-cmd" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>
                          {copiedKey === "install-cmd" ? "Copied" : "Copy"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Step 2: Register Native Host with Chromium
                    </span>
                    <div className="flex items-center justify-between bg-zinc-900 text-zinc-200 p-2 rounded-lg font-mono text-xs">
                      <span className="select-all truncate">
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
                        className="ml-2 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[10px] font-sans flex items-center space-x-1"
                      >
                        {copiedKey === "register-cmd" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>
                          {copiedKey === "register-cmd" ? "Copied" : "Copy"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INTERCEPTION & RULES */}
          {activeTab === "interception" && (
            <div className="space-y-4">
              {/* Interception Mode */}
              <div className="bg-white dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/80 rounded-xl p-5 shadow-xs space-y-3">
                <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  Interception Mode
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      {
                        id: "auto",
                        name: "Automatic (AUTO)",
                        desc: "Immediately offload matching downloads to aria2c.",
                      },
                      {
                        id: "ask",
                        name: "Prompt (ASK)",
                        desc: "Pause browser download and prompt for confirmation.",
                      },
                      {
                        id: "off",
                        name: "Disabled (OFF)",
                        desc: "Do not intercept; proceed through Chromium engine.",
                      },
                    ] as const
                  ).map((mode) => {
                    const selected = settings.mode === mode.id;
                    return (
                      <label
                        key={mode.id}
                        className={`p-3.5 border rounded-lg cursor-pointer transition-all ${
                          selected
                            ? "border-blue-500 bg-blue-50/20 dark:bg-blue-950/20 dark:border-blue-500"
                            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="mode"
                            value={mode.id}
                            checked={selected}
                            onChange={() =>
                              setSettings({
                                ...settings,
                                mode: mode.id as InterceptionMode,
                              })
                            }
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                            {mode.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1.5 leading-snug">
                          {mode.desc}
                        </p>
                      </label>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.interceptAll}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          interceptAll: e.target.checked,
                        })
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <div>
                      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        Catch-All Interception (Intercept All Files)
                      </span>
                      <p className="text-[11px] text-zinc-500">
                        Offloads every file download regardless of extension,
                        except explicit exclusions.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Filters: Extensions & Domains */}
              <div className="bg-white dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/80 rounded-xl p-5 shadow-xs space-y-4">
                <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  Extension & Domain Filters
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Included File Extensions
                    </label>
                    <textarea
                      rows={3}
                      value={incExtStr}
                      onChange={(e) => setIncExtStr(e.target.value)}
                      placeholder="iso, zip, tar.gz, mp4, 7z, dmg, exe..."
                      className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Comma-separated list of extensions.
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Excluded File Extensions
                    </label>
                    <textarea
                      rows={3}
                      value={excExtStr}
                      onChange={(e) => setExcExtStr(e.target.value)}
                      placeholder="crx, pdf..."
                      className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Never offload files with these extensions.
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Included Domains
                    </label>
                    <textarea
                      rows={2}
                      value={incDomStr}
                      onChange={(e) => setIncDomStr(e.target.value)}
                      placeholder="releases.ubuntu.com, downloads.example.com..."
                      className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Always intercept from these domains.
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Excluded Domains
                    </label>
                    <textarea
                      rows={2}
                      value={excDomStr}
                      onChange={(e) => setExcDomStr(e.target.value)}
                      placeholder="localhost, 127.0.0.1, internal.domain..."
                      className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Never intercept from these domains.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STORAGE & FOLDERS */}
          {activeTab === "storage" && (
            <div className="space-y-4">
              {/* Default download directory */}
              <div className="bg-white dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/80 rounded-xl p-5 shadow-xs space-y-3">
                <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  Default Save Directory
                </h2>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={settings.downloadDirectory}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        downloadDirectory: e.target.value,
                      })
                    }
                    placeholder="Leave empty for OS default (~/Downloads)"
                    className="flex-1 p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
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
                    className="px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center space-x-1 flex-shrink-0"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Browse...</span>
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Absolute filesystem path where aria2c has read/write
                  permissions.
                </p>
              </div>

              {/* Smart Sub-directory Routing */}
              <div className="bg-white dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/80 rounded-xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                      Smart Sub-Folder Routing
                    </h2>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Automatically categorize downloads into sub-folders based
                      on file extension.
                    </p>
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
                    className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Rule</span>
                  </button>
                </div>

                <div className="space-y-2 text-xs pt-1">
                  {(settings.subDirectoryRouting || []).length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">
                      No sub-directory rules configured.
                    </p>
                  ) : (
                    (settings.subDirectoryRouting || []).map((route, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={route.pattern}
                          onChange={(e) => {
                            const updated = [
                              ...(settings.subDirectoryRouting || []),
                            ];
                            updated[idx] = {
                              ...updated[idx],
                              pattern: e.target.value,
                            };
                            setSettings({
                              ...settings,
                              subDirectoryRouting: updated,
                            });
                          }}
                          placeholder="Pattern (e.g. iso,dmg or zip,tar.gz)"
                          className="flex-1 p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-zinc-400 font-mono">→</span>
                        <input
                          type="text"
                          value={route.subDirectory}
                          onChange={(e) => {
                            const updated = [
                              ...(settings.subDirectoryRouting || []),
                            ];
                            updated[idx] = {
                              ...updated[idx],
                              subDirectory: e.target.value,
                            };
                            setSettings({
                              ...settings,
                              subDirectoryRouting: updated,
                            });
                          }}
                          placeholder="Sub-folder (e.g. Disk Images)"
                          className="w-44 p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                          className="p-2 text-zinc-400 hover:text-rose-500 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ENGINE & NETWORK */}
          {activeTab === "engine" && (
            <div className="space-y-4">
              {/* Aria2 Engine Configuration */}
              <div className="bg-white dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/80 rounded-xl p-5 shadow-xs space-y-4">
                <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  Aria2 Connection & Engine Defaults
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Connections per File (Split: 1–16)
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
                        className="flex-1 accent-blue-600"
                      />
                      <span className="w-6 font-mono font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                        {settings.defaultSplit}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
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
                      className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Max Download Speed Limit (0 = Unlimited)
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
                      placeholder="0 for unlimited, or e.g. 5M, 500K"
                      className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Default Proxy (Optional)
                    </label>
                    <input
                      type="text"
                      value={settings.defaultProxy}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultProxy: e.target.value,
                        })
                      }
                      placeholder="socks5://127.0.0.1:1080 or http://127.0.0.1:8080"
                      className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Refresh Link Capture Timeout (Seconds)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={settings.refreshCaptureTimeoutSeconds || 30}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          refreshCaptureTimeoutSeconds: Math.max(5, parseInt(e.target.value, 10) || 30),
                        })
                      }
                      placeholder="30"
                      className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2 text-xs">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.defaultCheckCertificate}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultCheckCertificate: e.target.checked,
                        })
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      Verify SSL/TLS Certificates (`check-certificate`)
                    </span>
                  </label>

                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoFileRenaming}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          autoFileRenaming: e.target.checked,
                        })
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      Auto-Rename Duplicate Files (`auto-file-renaming`)
                    </span>
                  </label>
                </div>
              </div>

              {/* Security & Header Forwarding */}
              <div className="bg-white dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/80 rounded-xl p-5 shadow-xs space-y-3">
                <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  Authentication & Header Forwarding
                </h2>

                <div className="space-y-2.5 text-xs">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.forwardCookies}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          forwardCookies: e.target.checked,
                        })
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Forward Domain-Scoped Cookies
                      </span>
                      <p className="text-[11px] text-zinc-500">
                        Sends exact cookies for the target URL to aria2c for
                        authenticated downloads.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.forwardUserAgent}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          forwardUserAgent: e.target.checked,
                        })
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Forward Browser User-Agent
                      </span>
                      <p className="text-[11px] text-zinc-500">
                        Passes Chromium user-agent header to bypass
                        anti-scraping filters.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.forwardReferer}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          forwardReferer: e.target.checked,
                        })
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Forward Referer Header
                      </span>
                      <p className="text-[11px] text-zinc-500">
                        Passes initiating page referrer to satisfy
                        anti-hotlinking rules.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </form>
      </main>

      {/* Footer */}
      <Footer maxWidth="max-w-6xl" />
    </div>
  );
}
