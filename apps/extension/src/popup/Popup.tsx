import React, { useEffect, useState } from "react";
import type {
  DownloadBinding,
  ExtensionSettings,
  PendingPromptItem,
  AwaitingRefreshState,
  RefreshPromptItem,
} from "@aria2-browser/protocol";
import { formatBytes, formatSpeed, formatEta } from "../utils/format.js";
import { useSystemTheme } from "../utils/useTheme.js";
import { FileIcon } from "../utils/FileIcon.js";
import { GithubIcon } from "../utils/GithubIcon.js";
import { AUTHOR_CONFIG } from "../utils/author.js";
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
  ArrowRight,
  Copy,
  Check,
  Radio,
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
  const [refreshModalTab, setRefreshModalTab] = useState<"capture" | "paste">("capture");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [awaitingRefresh, setAwaitingRefresh] = useState<AwaitingRefreshState | null>(null);
  const [refreshPrompt, setRefreshPrompt] = useState<RefreshPromptItem | null>(null);
  const [now, setNow] = useState(Date.now());
  const [refreshSuccessMessage, setRefreshSuccessMessage] = useState<string | null>(null);
  const [lastHandledSuccessTs, setLastHandledSuccessTs] = useState<number>(0);

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
                  ? "A file with this name already exists in destination folder."
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
      if (res?.success && res.data.nativeHost?.ok) {
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
    });

    chrome.runtime.sendMessage({ type: "GET_REFRESH_STATE" }, (res) => {
      if (res?.success && res.data) {
        setAwaitingRefresh(res.data.awaitingRefresh || null);
        setRefreshPrompt(res.data.refreshPrompt || null);
      }
    });

    chrome.storage.local.get("lastRefreshSuccess", (res) => {
      const data = res?.lastRefreshSuccess;
      if (data && data.timestamp > lastHandledSuccessTs && Date.now() - data.timestamp < 5000) {
        setLastHandledSuccessTs(data.timestamp);
        setRefreshSuccessMessage(`Link refreshed & resumed for ${data.filename || "task"}!`);
        setTimeout(() => setRefreshSuccessMessage(null), 4000);
      }
    });
  };

  useEffect(() => {
    fetchStatusAndData();
    const interval = setInterval(fetchStatusAndData, 1500);
    const ticker = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearInterval(interval);
      clearInterval(ticker);
    };
  }, [lastHandledSuccessTs]);

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
    setRefreshError(null);
    chrome.runtime.sendMessage(
      { type: "REFRESH_DOWNLOAD_URL", payload: { gid, newUrl } },
      (res) => {
        if (res?.success) {
          setRefreshingLink(null);
          setRefreshSuccessMessage("Download link refreshed & resumed successfully!");
          setTimeout(() => setRefreshSuccessMessage(null), 4000);
          fetchStatusAndData();
        } else {
          setRefreshModalTab("capture");
          setRefreshError(
            res?.error
              ? `Pasted link failed: ${res.error}. Defaulted to Browser Interception mode.`
              : "Pasted link failed. Defaulted to Browser Interception mode."
          );
        }
      }
    );
  };

  const handleStartRefreshCapture = (gid: string) => {
    chrome.runtime.sendMessage(
      { type: "START_REFRESH_CAPTURE", payload: { gid } },
      () => {
        setRefreshingLink(null);
        fetchStatusAndData();
      }
    );
  };

  const handleCancelRefreshCapture = () => {
    chrome.runtime.sendMessage(
      { type: "CANCEL_REFRESH_CAPTURE" },
      () => fetchStatusAndData()
    );
  };

  const handleResolveRefreshPrompt = (action: "accept" | "cancel") => {
    chrome.runtime.sendMessage(
      { type: "RESOLVE_REFRESH_PROMPT", payload: { action } },
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
        setConflictWarning(`File "${chosenFilename}" already exists in destination folder.`);
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
                ? "A file with this name already exists in destination folder."
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
  const totalSpeed = downloads.reduce((acc, d) => acc + (d.speed || 0), 0);
  const remainingSeconds = awaitingRefresh
    ? Math.max(0, Math.ceil((awaitingRefresh.startedAt + awaitingRefresh.timeoutSeconds * 1000 - now) / 1000))
    : 0;

  return (
    <div className="relative flex flex-col h-[520px] w-[420px] bg-[#fafafa] dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans text-xs select-none antialiased">
      {/* Top Header */}
      <header className="px-3.5 py-2.5 bg-white dark:bg-[#121215] border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between z-10">
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 rounded-md bg-blue-600/10 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">
            <Download className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-[13px] tracking-tight">Surge</span>
            <div className="flex items-center space-x-1.5 px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60 text-[10px]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`}
              />
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                {isConnected ? "Host Ready" : "Host Offline"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          {activeDownloads.length > 0 && (
            <button
              onClick={anyActive ? handlePauseAll : handleResumeAll}
              title={anyActive ? "Pause All" : "Resume All"}
              className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              {anyActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={openDashboard}
            title="Open Dashboard"
            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={openOptions}
            title="Settings"
            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Global Refresh Success Toast Banner */}
      {refreshSuccessMessage && (
        <div className="px-3 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 animate-in fade-in duration-200 z-10">
          <div className="flex items-center space-x-1.5 truncate">
            <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="font-medium text-[11px] truncate">{refreshSuccessMessage}</span>
          </div>
          <button
            onClick={() => setRefreshSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 p-0.5 flex-shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Mode Selector Strip */}
      <div className="px-3.5 py-1.5 bg-[#f4f4f5]/60 dark:bg-[#141417]/60 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Interception</span>
        <div className="flex bg-zinc-200/70 dark:bg-zinc-800/80 p-0.5 rounded-md text-[11px] font-medium">
          {(["auto", "ask", "off"] as const).map((m) => {
            const active = settings?.mode === m;
            return (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`px-2.5 py-0.5 rounded transition-all ${
                  active
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                {m.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Offline Alert Strip */}
      {!isConnected && (
        <div className="mx-3.5 mt-2.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-[11px] flex flex-col space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span>Native Host / aria2c not connected</span>
            </div>
            <button
              onClick={openOptions}
              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
            >
              Setup →
            </button>
          </div>
          <div className="flex items-center justify-between bg-zinc-900 text-zinc-200 px-2 py-1 rounded font-mono text-[10px]">
            <span className="truncate">{getOsInstallCommand()}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(getOsInstallCommand());
                setCopiedCmd(true);
                setTimeout(() => setCopiedCmd(false), 2000);
              }}
              className="ml-2 px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 rounded font-sans flex items-center space-x-1"
            >
              {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCmd ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Pending ASK Prompts */}
      {pendingPrompts.length > 0 && (
        <div className="m-3 p-3 bg-white dark:bg-[#141417] border border-blue-500/40 rounded-xl shadow-sm space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              <FileIcon filename={pendingPrompts[0].filename} size={16} />
              <div className="min-w-0">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate block text-xs">
                  {pendingPrompts[0].filename || "Incoming download"}
                </span>
                <span className="text-[10px] text-zinc-400 truncate block">
                  {pendingPrompts[0].url}
                </span>
              </div>
            </div>
            {pendingPrompts[0].size > 0 && (
              <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex-shrink-0">
                {formatBytes(pendingPrompts[0].size)}
              </span>
            )}
          </div>

          {conflictWarning && (
            <div className="flex items-center space-x-1.5 p-1.5 bg-rose-500/10 border border-rose-500/20 rounded-md text-rose-600 dark:text-rose-400 text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{conflictWarning}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <input
              type="text"
              value={promptFilename}
              onChange={(e) => {
                setPromptFilename(e.target.value);
                setConflictWarning(null);
              }}
              placeholder="Filename"
              className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex items-center space-x-1.5">
              <input
                type="text"
                value={promptDirectory}
                onChange={(e) => setPromptDirectory(e.target.value)}
                placeholder="Default save folder (~/Downloads)"
                className="flex-1 px-2 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 truncate"
              />
              <button
                type="button"
                onClick={() => handleSelectFolder(pendingPrompts[0].id)}
                disabled={selectingFolder}
                className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md text-[11px] font-medium transition-colors flex-shrink-0"
              >
                {selectingFolder ? "..." : "Browse"}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
            <button
              onClick={() => handlePromptDecision(pendingPrompts[0].id, "cancel")}
              className="text-zinc-400 hover:text-rose-500 text-[11px] transition-colors"
            >
              Cancel
            </button>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => handlePromptDecision(pendingPrompts[0].id, "browser")}
                className="px-2.5 py-1 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-[11px] font-medium transition-colors"
              >
                Keep Browser
              </button>
              <button
                onClick={() => handlePromptDecision(pendingPrompts[0].id, "aria2")}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-[11px] font-semibold transition-colors flex items-center space-x-1"
              >
                <span>aria2c</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Items List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {loading ? (
          <div className="h-full flex items-center justify-center text-zinc-400">
            <Activity className="w-4 h-4 animate-spin mr-2" />
            <span>Loading...</span>
          </div>
        ) : downloads.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 py-12">
            <Download className="w-8 h-8 text-zinc-300 dark:text-zinc-700 stroke-[1.2] mb-2" />
            <p className="font-medium text-zinc-600 dark:text-zinc-400 text-xs">No downloads yet</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 text-center">
              Intercepted downloads appear here automatically
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
                className="group relative bg-white dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg p-2.5 transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2 min-w-0 flex-1">
                    <div className="mt-0.5 flex-shrink-0">
                      <FileIcon filename={item.filename || item.url} size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="font-medium text-zinc-900 dark:text-zinc-100 text-[12px] truncate leading-tight"
                        title={item.filename || item.url}
                      >
                        {item.filename || "Interception pending..."}
                      </p>
                      {isFileMissing ? (
                        <p className="text-[10px] text-rose-500 dark:text-rose-400 truncate mt-0.5">
                          File removed from disk
                        </p>
                      ) : (
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5" title={item.url}>
                          {item.url}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action Icons */}
                  <div className="flex items-center space-x-0.5 flex-shrink-0">
                    {item.gid && (
                      <>
                        {isFileMissing && (
                          <>
                            <button
                              onClick={() => handleRestart(item.gid)}
                              title="Restart"
                              className="p-1 text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDirectRemove(item.gid)}
                              title="Remove"
                              className="p-1 text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {isActive && (
                          <>
                            <button
                              onClick={() => handlePause(item.gid)}
                              title="Pause"
                              className="p-1 text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Pause className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleCancel(item.gid)}
                              title="Cancel"
                              className="p-1 text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenFolder(item.gid, item.filename)}
                              title="Show in Folder"
                              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {isPaused && (
                          <>
                            <button
                              onClick={() => handleResume(item.gid)}
                              title="Resume"
                              className="p-1 text-zinc-400 hover:text-emerald-500 dark:hover:text-emerald-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setRefreshingLink({ gid: item.gid, url: item.url, filename: item.filename });
                                setRefreshModalTab("capture");
                                setRefreshError(null);
                              }}
                              title="Refresh URL"
                              className="p-1 text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleCancel(item.gid)}
                              title="Cancel"
                              className="p-1 text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenFolder(item.gid, item.filename)}
                              title="Show in Folder"
                              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {(isFailed || isCompleted) && (
                          <>
                            {isFailed && item.errorMessage !== "Task not found in session" && (
                              <button
                                onClick={() => {
                                  setRefreshingLink({ gid: item.gid, url: item.url, filename: item.filename });
                                  setRefreshModalTab("capture");
                                  setRefreshError(null);
                                }}
                                title="Refresh URL"
                                className="p-1 text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setConfirmRemove({
                                  gid: item.gid,
                                  filename: item.filename || "download",
                                  isCompleted,
                                })
                              }
                              title="Remove"
                              className="p-1 text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenFolder(item.gid, item.filename)}
                              title="Show in Folder"
                              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-2">
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1 overflow-hidden">
                    <div
                      className={`h-1 rounded-full transition-all duration-300 ${
                        isFileMissing
                          ? "bg-rose-500"
                          : isCompleted
                          ? "bg-emerald-500"
                          : isFailed
                          ? "bg-rose-500"
                          : isPaused
                          ? "bg-amber-500"
                          : "bg-blue-600 dark:bg-blue-500"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Status metrics line */}
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-mono tabular-nums">
                    <span>
                      {isFileMissing ? (
                        <span className="text-rose-500 dark:text-rose-400 font-sans text-[10px] font-medium">Missing</span>
                      ) : item.totalBytes > 0 ? (
                        `${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)} (${percent}%)`
                      ) : (
                        formatBytes(item.receivedBytes)
                      )}
                    </span>
                    <div className="flex items-center space-x-1.5">
                      {isActive && item.speed > 0 && (
                        <>
                          <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                            {formatSpeed(item.speed)}
                          </span>
                          {item.totalBytes > item.receivedBytes && (
                            <span className="text-zinc-400">
                              • {formatEta((item.totalBytes - item.receivedBytes) / item.speed)}
                            </span>
                          )}
                        </>
                      )}
                      {isCompleted && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-sans text-[10px] font-medium">
                          Done
                        </span>
                      )}
                      {isPaused && (
                        <span className="text-amber-600 dark:text-amber-400 font-sans text-[10px] font-medium">
                          Paused
                        </span>
                      )}
                      {isFailed && (
                        <span className="text-rose-500 dark:text-rose-400 font-sans text-[10px] font-medium">
                          Cancelled
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {awaitingRefresh?.gid === item.gid && (
                  <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400">
                    <div className="flex items-center space-x-1.5 min-w-0 pr-2">
                      <Radio className="w-3.5 h-3.5 animate-pulse text-amber-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="font-semibold text-[11px]">
                          Listening ({remainingSeconds}s)
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400 ml-1 truncate">
                          • Click download on page to resume
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleCancelRefreshCapture}
                      className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 rounded text-[10px] font-medium flex-shrink-0 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <footer className="px-3.5 py-2 bg-white dark:bg-[#121215] border-t border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 z-10">
        <div className="flex items-center space-x-1.5 font-mono tabular-nums">
          <span>{activeDownloads.length} active</span>
          {totalSpeed > 0 && (
            <>
              <span>•</span>
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">{formatSpeed(totalSpeed)}</span>
            </>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 border-r border-zinc-200 dark:border-zinc-800 pr-2">
            <a
              href={AUTHOR_CONFIG.github}
              target="_blank"
              rel="noopener noreferrer"
              title={`GitHub (${AUTHOR_CONFIG.name})`}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <GithubIcon className="w-3.5 h-3.5" />
            </a>
            <a
              href={AUTHOR_CONFIG.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              title={`Portfolio (${AUTHOR_CONFIG.name})`}
              className="p-1 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Globe className="w-3.5 h-3.5" />
            </a>
          </div>
          <button
            onClick={openDashboard}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-500 font-medium hover:underline flex items-center space-x-0.5"
          >
            <span>Dashboard</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </footer>

      {/* Domain Mismatch Warning Prompt Modal */}
      {refreshPrompt && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#141417] border border-amber-500/30 rounded-xl p-3.5 w-full shadow-modal space-y-2.5">
            <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <h3 className="font-semibold text-xs">Domain Mismatch Warning</h3>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
              Captured link domain (<span className="font-mono font-bold text-amber-600 dark:text-amber-400">{refreshPrompt.newDomain}</span>) differs from original (<span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">{refreshPrompt.originalDomain}</span>).
            </p>
            <div className="p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-[10px] space-y-0.5 font-mono">
              <p className="text-zinc-500 truncate" title={refreshPrompt.targetFilename}>
                Target: {refreshPrompt.targetFilename}
              </p>
              <p className="text-zinc-500 truncate" title={refreshPrompt.newUrl}>
                New URL: {refreshPrompt.newUrl}
              </p>
            </div>
            <p className="text-[11px] text-zinc-500">
              Accept this link to refresh and resume download?
            </p>
            <div className="flex justify-end space-x-1.5 pt-1">
              <button
                onClick={() => handleResolveRefreshPrompt("cancel")}
                className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-2.5 py-1"
              >
                Reject & Cancel
              </button>
              <button
                onClick={() => handleResolveRefreshPrompt("accept")}
                className="text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-500 px-3 py-1 rounded-md transition-colors"
              >
                Accept & Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refresh Link Modal */}
      {refreshingLink && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#141417] border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 w-full shadow-modal space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Link2 className="w-4 h-4 text-blue-500" />
                <h3 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">Refresh Download Link</h3>
              </div>
              <button
                onClick={() => {
                  setRefreshingLink(null);
                  setRefreshError(null);
                }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-zinc-500 truncate font-mono" title={refreshingLink.filename}>
              {refreshingLink.filename}
            </p>

            {/* Tab switch */}
            <div className="flex rounded-md bg-zinc-100 dark:bg-zinc-800 p-0.5 text-[11px] font-medium">
              <button
                onClick={() => {
                  setRefreshModalTab("capture");
                  setRefreshError(null);
                }}
                className={`flex-1 py-1 rounded transition-all ${
                  refreshModalTab === "capture"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                1. Intercept Browser (Default)
              </button>
              <button
                onClick={() => {
                  setRefreshModalTab("paste");
                  setRefreshError(null);
                }}
                className={`flex-1 py-1 rounded transition-all ${
                  refreshModalTab === "paste"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                2. Direct Paste Link
              </button>
            </div>

            {refreshError && (
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-md text-[10px] text-amber-700 dark:text-amber-300 space-y-0.5">
                <p className="flex items-center space-x-1 font-medium">
                  <AlertCircle className="w-3 h-3 flex-shrink-0 text-amber-500" />
                  <span>{refreshError}</span>
                </p>
              </div>
            )}

            {refreshModalTab === "capture" ? (
              <div className="space-y-2 text-xs">
                <div className="p-2 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                  <p className="font-semibold text-blue-600 dark:text-blue-400 flex items-center space-x-1">
                    <Radio className="w-3 h-3" />
                    <span>How Browser Interception Works:</span>
                  </p>
                  <ol className="list-decimal list-inside space-y-0.5 text-zinc-500 dark:text-zinc-400 text-[10px]">
                    <li>Click <strong>Start Capture Mode</strong> below.</li>
                    <li>Go back to the download page and click download.</li>
                    <li>Surge will capture the fresh link & cookies, and resume this task.</li>
                  </ol>
                </div>

                <div className="flex justify-end space-x-1.5 pt-1">
                  <button
                    onClick={() => {
                      setRefreshingLink(null);
                      setRefreshError(null);
                    }}
                    className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-2.5 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleStartRefreshCapture(refreshingLink.gid)}
                    className="text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-md transition-colors"
                  >
                    Start Capture Mode
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  value={refreshingLink.url}
                  onChange={(e) => {
                    setRefreshingLink({ ...refreshingLink, url: e.target.value });
                    setRefreshError(null);
                  }}
                  placeholder="Paste updated download link..."
                  className="w-full text-xs p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-zinc-100 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                />

                <div className="flex justify-end space-x-1.5 pt-1">
                  <button
                    onClick={() => {
                      setRefreshingLink(null);
                      setRefreshError(null);
                    }}
                    className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-2.5 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleRefreshUrl(refreshingLink.gid, refreshingLink.url.trim())}
                    className="text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-md transition-colors"
                  >
                    Update & Resume
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove Confirmation Popover */}
      {confirmRemove && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#141417] border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 w-full shadow-modal space-y-2.5">
            <div className="flex items-center space-x-2">
              <Trash2 className="w-4 h-4 text-rose-500" />
              <h3 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                {confirmRemove.isCompleted ? "Remove Completed File" : "Remove Incomplete Task"}
              </h3>
            </div>
            <p className="text-[11px] text-zinc-500 truncate font-mono" title={confirmRemove.filename}>
              {confirmRemove.filename}
            </p>

            {confirmRemove.isCompleted ? (
              <div className="space-y-1.5 pt-1">
                <button
                  onClick={() => executeRemove(confirmRemove.gid, false)}
                  className="w-full py-1.5 px-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium rounded-md transition-colors text-left flex items-center justify-between"
                >
                  <span>Remove from list only</span>
                  <span className="text-[10px] text-zinc-400">Keep file</span>
                </button>
                <button
                  onClick={() => executeRemove(confirmRemove.gid, true)}
                  className="w-full py-1.5 px-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium rounded-md border border-rose-500/20 transition-colors text-left flex items-center justify-between"
                >
                  <span>Delete file from disk & remove</span>
                  <span className="text-[10px] text-rose-500">Purge file</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] text-zinc-500 leading-normal">
                  This download is incomplete. Removing it will delete partial data from disk.
                </p>
                <button
                  onClick={() => executeRemove(confirmRemove.gid, true)}
                  className="w-full py-1.5 px-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-md transition-colors text-center"
                >
                  Delete Partial Files & Remove
                </button>
              </div>
            )}

            <div className="pt-1 flex justify-end">
              <button
                onClick={() => setConfirmRemove(null)}
                className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium px-2 py-1"
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
