import React, { useEffect, useState } from "react";
import type { DownloadBinding, ExtensionSettings, PendingPromptItem } from "@aria2-browser/protocol";
import { formatBytes, formatSpeed, formatEta } from "../utils/format.js";
import { useSystemTheme } from "../utils/useTheme.js";
import {
  Download,
  Settings,
  ExternalLink,
  Pause,
  Play,
  X,
  Trash2,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Activity,
  Link2,
  Globe,
  FolderOpen,
  Folder,
  FileText,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";

export function Popup() {
  useSystemTheme();
  const [downloads, setDownloads] = useState<DownloadBinding[]>([]);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [confirmRemove, setConfirmRemove] = useState<{
    gid: string;
    filename: string;
    isCompleted: boolean;
  } | null>(null);
  const [refreshingLink, setRefreshingLink] = useState<{ gid: string; url: string; filename: string } | null>(null);

  // Pending ASK Mode Prompts
  const [pendingPrompts, setPendingPrompts] = useState<PendingPromptItem[]>([]);
  const [activePromptId, setActivePromptId] = useState<number | null>(null);
  const [promptFilename, setPromptFilename] = useState<string>("");
  const [promptDirectory, setPromptDirectory] = useState<string>("");
  const [selectingFolder, setSelectingFolder] = useState<boolean>(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const getOsInstallCommand = () => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "brew install aria2";
    if (ua.includes("win")) return "winget install aria2.aria2";
    return "sudo apt install aria2";
  };

  const fetchStatusAndData = () => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
      if (res?.success) setSettings(res.data);
    });

    chrome.runtime.sendMessage({ type: "GET_DOWNLOADS" }, (res) => {
      if (res?.success) setDownloads(res.data);
      setLoading(false);
    });

    chrome.runtime.sendMessage({ type: "GET_PENDING_PROMPTS" }, (res) => {
      if (res?.success && Array.isArray(res.data)) {
        setPendingPrompts(res.data);
        if (res.data.length > 0) {
          const first = res.data[0];
          setActivePromptId((prevId) => {
            if (prevId !== first.id) {
              setPromptFilename(first.filename || "");
              setPromptDirectory(first.directory || "");
              setConflictWarning(
                first.hasConflict
                  ? "A completed file with this name already exists in destination folder. Please rename before downloading."
                  : null
              );
              return first.id;
            }
            return prevId;
          });
        } else {
          setActivePromptId(null);
          setPromptFilename("");
          setPromptDirectory("");
          setConflictWarning(null);
        }
      }
    });

    chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (res) => {
      if (res?.success && res.data.nativeHost.ok) {
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
    });
  };

  useEffect(() => {
    fetchStatusAndData();
    const interval = setInterval(fetchStatusAndData, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleModeChange = (mode: "off" | "ask" | "auto") => {
    if (!settings) return;
    chrome.runtime.sendMessage(
      { type: "UPDATE_SETTINGS", payload: { mode } },
      (res) => {
        if (res?.success) setSettings(res.data);
      }
    );
  };

  const handlePause = (gid: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.gid === gid ? { ...d, state: "paused", speed: 0 } : d))
    );
    chrome.runtime.sendMessage({ type: "PAUSE_DOWNLOAD", payload: { gid } }, () => fetchStatusAndData());
  };

  const handleResume = (gid: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.gid === gid ? { ...d, state: "aria2-active" } : d))
    );
    chrome.runtime.sendMessage({ type: "RESUME_DOWNLOAD", payload: { gid } }, () => fetchStatusAndData());
  };

  const handleCancel = (gid: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.gid === gid ? { ...d, state: "cancelled", speed: 0 } : d))
    );
    chrome.runtime.sendMessage({ type: "CANCEL_DOWNLOAD", payload: { gid } }, () => fetchStatusAndData());
  };

  const handleRefreshUrl = (gid: string, newUrl: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.gid === gid ? { ...d, url: newUrl, state: "aria2-active" } : d))
    );
    chrome.runtime.sendMessage(
      { type: "REFRESH_DOWNLOAD_URL", payload: { gid, newUrl } },
      () => fetchStatusAndData()
    );
  };

  const handleOpenFolder = (gid?: string, filename?: string) => {
    chrome.runtime.sendMessage({ type: "OPEN_IN_FOLDER", payload: { gid, filename } });
  };

  const handleSelectFolder = (browserId?: number) => {
    if (selectingFolder) return;
    setSelectingFolder(true);
    const initialDirectory = promptDirectory.trim() || (pendingPrompts.length > 0 ? pendingPrompts[0].directory : undefined);
    chrome.runtime.sendMessage(
      { type: "SELECT_FOLDER", payload: { browserId, defaultPath: initialDirectory } },
      (res) => {
        setSelectingFolder(false);
        if (res?.success && res.data?.path && !res.data.canceled) {
          setPromptDirectory(res.data.path);
        }
      }
    );
  };

  const handlePromptDecision = async (promptId: number, action: "aria2" | "browser" | "cancel") => {
    if (action === "aria2") {
      const targetPrompt = pendingPrompts.find((p) => p.id === promptId);
      const chosenFilename = promptFilename.trim() || targetPrompt?.filename || "download";
      const chosenDirectory = promptDirectory.trim() || targetPrompt?.directory || undefined;

      // Verify no conflict before dispatching
      const checkRes = await new Promise<{ exists: boolean; isCompleted: boolean }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "CHECK_FILE_CONFLICT", payload: { filename: chosenFilename, directory: chosenDirectory } },
          (res) => {
            if (res?.success && res.data) {
              resolve(res.data);
            } else {
              resolve({ exists: false, isCompleted: false });
            }
          }
        );
      });

      if (checkRes.isCompleted) {
        setConflictWarning(`File "${chosenFilename}" already exists in destination folder. Please rename before downloading.`);
        return;
      }
    }

    setConflictWarning(null);
    const chosenFilename = promptFilename.trim() || undefined;
    const chosenDirectory = promptDirectory.trim() || undefined;

    chrome.runtime.sendMessage(
      {
        type: "PROMPT_DECISION",
        payload: {
          browserId: promptId,
          action,
          filename: chosenFilename,
          directory: chosenDirectory,
        },
      },
      () => {
        setPendingPrompts((prev) => {
          const next = prev.filter((p) => p.id !== promptId);
          if (next.length > 0) {
            setActivePromptId(next[0].id);
            setPromptFilename(next[0].filename || "");
            setPromptDirectory(next[0].directory || "");
            setConflictWarning(
              next[0].hasConflict
                ? "A completed file with this name already exists in destination folder. Please rename before downloading."
                : null
            );
          } else {
            setActivePromptId(null);
            setPromptFilename("");
            setPromptDirectory("");
            setConflictWarning(null);
          }
          return next;
        });
        fetchStatusAndData();
      }
    );
  };

  const executeRemove = (gid: string, deleteFile: boolean) => {
    setDownloads((prev) => prev.filter((d) => d.gid !== gid));
    setConfirmRemove(null);
    chrome.runtime.sendMessage({ type: "REMOVE_DOWNLOAD", payload: { gid, deleteFile } }, () =>
      fetchStatusAndData()
    );
  };

  const handleDirectRemove = (gid: string) => {
    setDownloads((prev) => prev.filter((d) => d.gid !== gid));
    chrome.runtime.sendMessage({ type: "REMOVE_DOWNLOAD", payload: { gid, deleteFile: true } }, () =>
      fetchStatusAndData()
    );
  };

  const handleRestart = (gid: string) => {
    chrome.runtime.sendMessage({ type: "RESTART_DOWNLOAD", payload: { gid } }, () =>
      fetchStatusAndData()
    );
  };

  const handlePauseAll = () => {
    setDownloads((prev) =>
      prev.map((d) => (d.state === "aria2-active" ? { ...d, state: "paused", speed: 0 } : d))
    );
    chrome.runtime.sendMessage({ type: "PAUSE_ALL_DOWNLOADS" }, () => fetchStatusAndData());
  };

  const handleResumeAll = () => {
    setDownloads((prev) =>
      prev.map((d) => (d.state === "paused" ? { ...d, state: "aria2-active" } : d))
    );
    chrome.runtime.sendMessage({ type: "RESUME_ALL_DOWNLOADS" }, () => fetchStatusAndData());
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const activeDownloads = downloads.filter((d) => d.state === "aria2-active" || d.state === "handoff-pending");
  const anyActive = activeDownloads.some((d) => d.speed > 0);

  return (
    <div className="relative flex flex-col h-[520px] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans text-sm select-none transition-colors duration-200">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2.5">
          <img src="/icons/icon-48.png" alt="Surge" className="w-7 h-7 rounded-lg shadow-sm" />
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Surge</h1>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`}
              />
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {isConnected ? "Host Connected" : "Host Offline"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          {activeDownloads.length > 0 && (
            <>
              {anyActive ? (
                <button
                  onClick={handlePauseAll}
                  title="Pause All Downloads"
                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                >
                  <Pause className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  onClick={handleResumeAll}
                  title="Resume All Downloads"
                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>
              )}
            </>
          )}

          <button
            onClick={openDashboard}
            title="Open Full Dashboard"
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={openOptions}
            title="Open Settings"
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mode Selector Strip */}
      <div className="bg-slate-100/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Interception:</span>
        <div className="flex bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
          {(["auto", "ask", "off"] as const).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`px-3 py-1 rounded-md transition-all ${
                settings?.mode === m
                  ? "bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-300 shadow-sm font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!isConnected && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-300 dark:border-amber-800/80 p-3 text-[11px] text-amber-900 dark:text-amber-100 flex flex-col space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-bold flex items-center space-x-1.5 text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Native Host / aria2c Offline</span>
            </div>
            <button
              onClick={openOptions}
              className="text-sky-600 dark:text-sky-400 font-bold hover:underline"
            >
              Setup Guide →
            </button>
          </div>

          <div className="bg-slate-900 text-slate-100 px-2.5 py-1.5 rounded-lg flex items-center justify-between font-mono text-[10px]">
            <span className="select-all truncate">{getOsInstallCommand()}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(getOsInstallCommand());
                setCopiedCmd(true);
                setTimeout(() => setCopiedCmd(false), 2000);
              }}
              className="ml-2 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded font-sans font-bold flex items-center space-x-1 flex-shrink-0 transition-colors"
            >
              {copiedCmd ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Pending ASK Prompts (Opened automatically from menubar) */}
      {pendingPrompts.length > 0 && (
        <div className="bg-sky-50/90 dark:bg-slate-900 border-b-2 border-sky-400 dark:border-sky-500 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <img src="/icons/icon-48.png" alt="Surge" className="w-6 h-6 rounded-md shadow-sm" />
              <div>
                <h2 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  Download Detected (Surge ASK)
                </h2>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {pendingPrompts.length > 1
                    ? `${pendingPrompts.length} downloads pending decision`
                    : "Confirm file name and folder before download"}
                </p>
              </div>
            </div>
            {pendingPrompts[0].size > 0 && (
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 rounded border border-sky-200 dark:border-sky-800">
                {formatBytes(pendingPrompts[0].size)}
              </span>
            )}
          </div>

          {/* URL */}
          <div
            className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center space-x-1"
            title={pendingPrompts[0].url}
          >
            <Globe className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{pendingPrompts[0].url}</span>
          </div>

          {/* Conflict Warning */}
          {conflictWarning && (
            <div className="flex items-start space-x-2 p-2 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-700 dark:text-rose-300 text-[11px] font-medium leading-snug">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-rose-500 mt-0.5" />
              <span>{conflictWarning}</span>
            </div>
          )}

          {/* File Name input */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
              <FileText className="w-3 h-3 text-sky-500" />
              <span>File Name:</span>
            </label>
            <input
              type="text"
              value={promptFilename}
              onChange={(e) => {
                setPromptFilename(e.target.value);
                setConflictWarning(null);
              }}
              placeholder={pendingPrompts[0].filename || "download"}
              className={`w-full px-2.5 py-1 bg-white dark:bg-slate-950 border rounded-lg text-slate-900 dark:text-slate-100 font-mono text-xs focus:ring-2 ${
                conflictWarning
                  ? "border-rose-400 dark:border-rose-600 focus:ring-rose-500"
                  : "border-slate-300 dark:border-slate-700 focus:ring-sky-500"
              }`}
            />
          </div>

          {/* Folder Selection via OS */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                <Folder className="w-3 h-3 text-sky-500" />
                <span>Save Folder:</span>
              </label>
              <button
                type="button"
                onClick={() => handleSelectFolder(pendingPrompts[0].id)}
                disabled={selectingFolder}
                className="px-2.5 py-0.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-950 dark:hover:bg-sky-900 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800 rounded font-semibold text-[10px] transition-colors flex items-center space-x-1"
              >
                <Folder className="w-3 h-3" />
                <span>{selectingFolder ? "Choosing..." : "Choose Folder"}</span>
              </button>
            </div>
            <input
              type="text"
              value={promptDirectory}
              onChange={(e) => setPromptDirectory(e.target.value)}
              placeholder={pendingPrompts[0].directory || "Default (~/Downloads)"}
              className="w-full px-2.5 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono text-xs focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-sky-100 dark:border-slate-800">
            <button
              onClick={() => handlePromptDecision(pendingPrompts[0].id, "cancel")}
              className="px-2.5 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePromptDecision(pendingPrompts[0].id, "browser")}
                className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Keep in Browser
              </button>
              <button
                onClick={() => handlePromptDecision(pendingPrompts[0].id, "aria2")}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center space-x-1"
              >
                <span>Download with aria2c</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Items List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
            <Activity className="w-6 h-6 animate-spin mr-2" />
            <span>Loading...</span>
          </div>
        ) : downloads.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 py-12">
            <Download className="w-10 h-10 text-slate-300 dark:text-slate-700 stroke-[1.5] mb-2" />
            <p className="font-medium text-slate-600 dark:text-slate-300 text-sm">No downloads yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-center">
              Intercepted downloads will appear here automatically.
            </p>
          </div>
        ) : (
          downloads.map((item) => {
            const percent =
              item.totalBytes > 0
                ? Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100))
                : item.state === "completed"
                ? 100
                : 0;

            const isFileMissing = item.state === "file-missing";
            const isPaused = item.state === "paused";
            const isCompleted = item.state === "completed";
            const isFailed = item.state === "failed" || item.state === "cancelled";
            const isActive = item.state === "aria2-active" || item.state === "handoff-pending" || item.state === "aria2-added";

            return (
              <div
                key={item.gid || item.browserId}
                className={`bg-white dark:bg-slate-900 border rounded-lg p-3 shadow-sm transition-all ${
                  isFileMissing
                    ? "border-rose-300 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10"
                    : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className="font-medium text-slate-900 dark:text-white text-xs truncate leading-snug"
                      title={item.filename || item.url}
                    >
                      {item.filename || "Interception pending..."}
                    </p>
                    {isFileMissing ? (
                      <p
                        className="text-[11px] text-rose-500 dark:text-rose-400 font-medium truncate mt-0.5"
                        title={item.errorMessage || "File or .aria2 control file was deleted from folder"}
                      >
                        {item.errorMessage || "File or .aria2 control file was deleted from folder"}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={item.url}>
                        {item.url}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    {item.gid && (
                      <>
                        {/* File Missing: Restart, Direct Remove (no prompt) */}
                        {isFileMissing && (
                          <>
                            <button
                              onClick={() => handleRestart(item.gid)}
                              title="Restart Download"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-sky-500 dark:text-sky-400 transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDirectRemove(item.gid)}
                              title="Remove without prompt"
                              className="p-1 hover:bg-rose-100 dark:hover:bg-rose-950/60 rounded text-rose-600 dark:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {/* Downloading: pause, cancel, show in folder */}
                        {isActive && (
                          <>
                            <button
                              onClick={() => handlePause(item.gid)}
                              title="Pause"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-amber-500 dark:text-amber-400 transition-colors"
                            >
                              <Pause className="w-3.5 h-3.5 fill-current" />
                            </button>
                            <button
                              onClick={() => handleCancel(item.gid)}
                              title="Cancel"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-rose-500 dark:text-rose-400 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenFolder(item.gid, item.filename)}
                              title="Show in folder"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 transition-colors"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {/* Paused: resume, cancel, show in folder */}
                        {isPaused && (
                          <>
                            <button
                              onClick={() => handleResume(item.gid)}
                              title="Resume"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-emerald-500 dark:text-emerald-400 transition-colors"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>
                            <button
                              onClick={() => handleCancel(item.gid)}
                              title="Cancel"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-rose-500 dark:text-rose-400 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenFolder(item.gid, item.filename)}
                              title="Show in folder"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 transition-colors"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {/* Failed: refresh link, remove, show in folder */}
                        {isFailed && (
                          <>
                            <button
                              onClick={() =>
                                setRefreshingLink({ gid: item.gid, url: item.url, filename: item.filename })
                              }
                              title="Refresh link"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-sky-500 dark:text-sky-400 transition-colors"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                setConfirmRemove({
                                  gid: item.gid,
                                  filename: item.filename || "download",
                                  isCompleted: false,
                                })
                              }
                              title="Remove"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenFolder(item.gid, item.filename)}
                              title="Show in folder"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 transition-colors"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {/* Completed: remove, show in folder */}
                        {isCompleted && (
                          <>
                            <button
                              onClick={() =>
                                setConfirmRemove({
                                  gid: item.gid,
                                  filename: item.filename || "download",
                                  isCompleted: true,
                                })
                              }
                              title="Remove"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenFolder(item.gid, item.filename)}
                              title="Show in folder"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 transition-colors"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-2.5">
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        isFileMissing
                          ? "bg-rose-500"
                          : isCompleted
                          ? "bg-emerald-500"
                          : isFailed
                          ? "bg-rose-500"
                          : isPaused
                          ? "bg-amber-500"
                          : "bg-sky-500"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    <span>
                      {isFileMissing ? (
                        <span className="text-rose-600 dark:text-rose-400 font-bold uppercase text-[10px] tracking-wider">
                          File Missing on Disk
                        </span>
                      ) : (
                        `${formatBytes(item.receivedBytes)} of ${formatBytes(item.totalBytes)} (${percent}%)`
                      )}
                    </span>
                    <div className="flex items-center space-x-2">
                      {isActive && item.speed > 0 && (
                        <>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {formatSpeed(item.speed)}
                          </span>
                          {item.totalBytes > item.receivedBytes && (
                            <span>ETA: {formatEta((item.totalBytes - item.receivedBytes) / item.speed)}</span>
                          )}
                        </>
                      )}
                      {isCompleted && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Complete</span>
                      )}
                      {isPaused && (
                        <span className="text-amber-500 dark:text-amber-400 font-semibold">Paused</span>
                      )}
                      {isFailed && (
                        <span className="text-rose-500 dark:text-rose-400 font-semibold">Cancelled</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{activeDownloads.length} active downloads</span>
        <button
          onClick={openDashboard}
          className="text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-semibold hover:underline"
        >
          View all history →
        </button>
      </div>

      {/* Refresh Link Modal */}
      {refreshingLink && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 w-full shadow-2xl space-y-3">
            <div className="flex items-center space-x-2">
              <Link2 className="w-4 h-4 text-sky-500" />
              <h3 className="font-bold text-xs text-slate-900 dark:text-white">Refresh Download Link</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 truncate font-semibold" title={refreshingLink.filename}>
              {refreshingLink.filename}
            </p>
            <textarea
              rows={3}
              value={refreshingLink.url}
              onChange={(e) => setRefreshingLink({ ...refreshingLink, url: e.target.value })}
              placeholder="Paste updated download link / token..."
              className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <div className="flex justify-end space-x-2 pt-1">
              <button
                onClick={() => setRefreshingLink(null)}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleRefreshUrl(refreshingLink.gid, refreshingLink.url.trim());
                  setRefreshingLink(null);
                }}
                className="text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
              >
                Update & Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Popover / Modal */}
      {confirmRemove && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 w-full shadow-2xl space-y-3">
            <div className="flex items-center space-x-2">
              <Trash2 className="w-4 h-4 text-rose-500" />
              <h3 className="font-bold text-xs text-slate-900 dark:text-white">
                {confirmRemove.isCompleted ? "Remove Completed Download" : "Remove Incomplete Download"}
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 truncate font-semibold" title={confirmRemove.filename}>
              {confirmRemove.filename}
            </p>

            {confirmRemove.isCompleted ? (
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => executeRemove(confirmRemove.gid, false)}
                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors text-left flex items-center justify-between"
                >
                  <span>Remove from list only</span>
                  <span className="text-[10px] text-slate-400 font-normal">Keep file</span>
                </button>
                <button
                  onClick={() => executeRemove(confirmRemove.gid, true)}
                  className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold rounded-lg border border-rose-200 dark:border-rose-800 transition-colors text-left flex items-center justify-between"
                >
                  <span>Delete file from disk & remove</span>
                  <span className="text-[10px] text-rose-400 font-normal">Purge file</span>
                </button>
              </div>
            ) : (
              <div className="pt-1 space-y-2">
                <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-900/50">
                  This download is not complete. Removing it will also delete any partial files and resume data from disk.
                </p>
                <button
                  onClick={() => executeRemove(confirmRemove.gid, true)}
                  className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors text-center"
                >
                  Delete Partial Files & Remove
                </button>
              </div>
            )}

            <div className="pt-1 flex justify-end">
              <button
                onClick={() => setConfirmRemove(null)}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium px-2 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
