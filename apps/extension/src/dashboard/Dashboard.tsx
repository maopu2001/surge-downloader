import React, { useEffect, useState, useMemo } from "react";
import type { DownloadBinding } from "@aria2-browser/protocol";
import { formatBytes, formatSpeed, formatEta } from "../utils/format.js";
import { useSystemTheme } from "../utils/useTheme.js";
import { FileIcon } from "../utils/FileIcon.js";
import { Footer } from "../components/Footer.js";
import {
  Download,
  Search,
  Pause,
  Play,
  X,
  Trash2,
  RefreshCw,
  Settings,
  FolderDown,
  AlertTriangle,
  Link2,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
} from "lucide-react";

type FilterTab = "all" | "active" | "completed" | "paused" | "failed";

export function Dashboard() {
  useSystemTheme();
  const [downloads, setDownloads] = useState<DownloadBinding[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [ariaInfo, setAriaInfo] = useState<string>("");
  const [confirmRemove, setConfirmRemove] = useState<{
    gid: string;
    filename: string;
    isCompleted: boolean;
  } | null>(null);
  const [confirmClearFinished, setConfirmClearFinished] = useState(false);
  const [clearDeleteFiles, setClearDeleteFiles] = useState(false);
  const [refreshingLink, setRefreshingLink] = useState<{
    gid: string;
    url: string;
    filename: string;
  } | null>(null);

  const refresh = () => {
    chrome.runtime.sendMessage({ type: "GET_DOWNLOADS" }, (res) => {
      if (res?.success) setDownloads(res.data);
    });

    chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (res) => {
      if (res?.success && res.data.nativeHost?.ok) {
        setIsConnected(true);
        if (res.data.aria2c?.ok) {
          setAriaInfo(res.data.aria2c.message);
        }
      } else {
        setIsConnected(false);
      }
    });
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 1500);
    return () => clearInterval(interval);
  }, []);

  const handlePause = (gid: string) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.gid === gid ? { ...d, state: "paused", speed: 0 } : d,
      ),
    );
    chrome.runtime.sendMessage(
      { type: "PAUSE_DOWNLOAD", payload: { gid } },
      () => refresh(),
    );
  };

  const handleResume = (gid: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.gid === gid ? { ...d, state: "aria2-active" } : d)),
    );
    chrome.runtime.sendMessage(
      { type: "RESUME_DOWNLOAD", payload: { gid } },
      () => refresh(),
    );
  };

  const handleCancel = (gid: string) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.gid === gid ? { ...d, state: "cancelled", speed: 0 } : d,
      ),
    );
    chrome.runtime.sendMessage(
      { type: "CANCEL_DOWNLOAD", payload: { gid } },
      () => refresh(),
    );
  };

  const handleRefreshUrl = (gid: string, newUrl: string) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.gid === gid ? { ...d, url: newUrl, state: "aria2-active" } : d,
      ),
    );
    chrome.runtime.sendMessage(
      { type: "REFRESH_DOWNLOAD_URL", payload: { gid, newUrl } },
      () => refresh(),
    );
  };

  const handleOpenFolder = (gid?: string, filename?: string) => {
    chrome.runtime.sendMessage({
      type: "OPEN_IN_FOLDER",
      payload: { gid, filename },
    });
  };

  const executeRemove = (gid: string, deleteFile: boolean) => {
    setDownloads((prev) => prev.filter((d) => d.gid !== gid));
    setConfirmRemove(null);
    chrome.runtime.sendMessage(
      { type: "REMOVE_DOWNLOAD", payload: { gid, deleteFile } },
      () => refresh(),
    );
  };

  const handleDirectRemove = (gid: string) => {
    setDownloads((prev) => prev.filter((d) => d.gid !== gid));
    chrome.runtime.sendMessage(
      { type: "REMOVE_DOWNLOAD", payload: { gid, deleteFile: true } },
      () => refresh(),
    );
  };

  const handleRestart = (gid: string) => {
    chrome.runtime.sendMessage(
      { type: "RESTART_DOWNLOAD", payload: { gid } },
      () => refresh(),
    );
  };

  const handlePauseAll = () => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.state === "aria2-active" ? { ...d, state: "paused", speed: 0 } : d,
      ),
    );
    chrome.runtime.sendMessage({ type: "PAUSE_ALL_DOWNLOADS" }, () =>
      refresh(),
    );
  };

  const handleResumeAll = () => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.state === "paused" ? { ...d, state: "aria2-active" } : d,
      ),
    );
    chrome.runtime.sendMessage({ type: "RESUME_ALL_DOWNLOADS" }, () =>
      refresh(),
    );
  };

  const executeClearFinished = (deleteFiles: boolean) => {
    setDownloads((prev) =>
      prev.filter(
        (d) =>
          d.state !== "completed" &&
          d.state !== "failed" &&
          d.state !== "cancelled" &&
          d.state !== "file-missing",
      ),
    );
    setConfirmClearFinished(false);
    chrome.runtime.sendMessage(
      { type: "CLEAR_FINISHED_DOWNLOADS", payload: { deleteFiles } },
      () => refresh(),
    );
  };

  const handleSync = () => {
    chrome.runtime.sendMessage({ type: "SYNC_DOWNLOADS" }, () => refresh());
  };

  const counts = useMemo(() => {
    let active = 0;
    let completed = 0;
    let paused = 0;
    let failed = 0;

    downloads.forEach((d) => {
      if (
        d.state === "aria2-active" ||
        d.state === "handoff-pending" ||
        d.state === "aria2-added"
      ) {
        active++;
      } else if (d.state === "completed") {
        completed++;
      } else if (d.state === "paused") {
        paused++;
      } else if (
        d.state === "failed" ||
        d.state === "cancelled" ||
        d.state === "file-missing"
      ) {
        failed++;
      }
    });

    return { all: downloads.length, active, completed, paused, failed };
  }, [downloads]);

  const filteredDownloads = useMemo(() => {
    return downloads.filter((d) => {
      const matchSearch =
        d.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.url.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;

      if (filterTab === "active") {
        return (
          d.state === "aria2-active" ||
          d.state === "handoff-pending" ||
          d.state === "aria2-added"
        );
      }
      if (filterTab === "completed") {
        return d.state === "completed";
      }
      if (filterTab === "paused") {
        return d.state === "paused";
      }
      if (filterTab === "failed") {
        return (
          d.state === "failed" ||
          d.state === "cancelled" ||
          d.state === "file-missing"
        );
      }
      return true;
    });
  }, [downloads, filterTab, searchQuery]);

  const totalSpeed = useMemo(() => {
    return downloads.reduce((acc, d) => acc + (d.speed || 0), 0);
  }, [downloads]);

  const hasActiveDownloads = counts.active > 0;
  const hasFinishedDownloads = counts.completed > 0 || counts.failed > 0;

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans antialiased flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-[#121215]/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm font-bold tracking-tight">
                  Surge Dashboard
                </h1>
                <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60 text-[11px]">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isConnected
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-rose-500"
                    }`}
                  />
                  <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                    {isConnected ? ariaInfo || "Connected" : "Offline"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {totalSpeed > 0 && (
              <div className="hidden sm:flex items-center space-x-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-md border border-blue-200/60 dark:border-blue-800/60 text-xs font-mono tabular-nums font-semibold mr-1">
                <span>↓</span>
                <span>{formatSpeed(totalSpeed)}</span>
              </div>
            )}

            {hasActiveDownloads && (
              <>
                <button
                  onClick={handlePauseAll}
                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  title="Pause All"
                >
                  <Pause className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Pause All</span>
                </button>

                <button
                  onClick={handleResumeAll}
                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  title="Resume All"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="hidden sm:inline">Resume All</span>
                </button>
              </>
            )}

            {hasFinishedDownloads && (
              <button
                onClick={() => setConfirmClearFinished(true)}
                className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                title="Clear Completed and Failed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Finished</span>
              </button>
            )}

            <button
              onClick={handleSync}
              className="p-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Sync with aria2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-6 py-6 flex-1 w-full">
        {/* Controls Bar: Filter Tabs & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center space-x-1 bg-zinc-200/70 dark:bg-zinc-900/80 p-0.5 rounded-lg text-xs font-medium self-start">
            {(
              [
                { id: "all", label: "All", count: counts.all },
                { id: "active", label: "Active", count: counts.active },
                {
                  id: "completed",
                  label: "Completed",
                  count: counts.completed,
                },
                { id: "paused", label: "Paused", count: counts.paused },
                { id: "failed", label: "Failed", count: counts.failed },
              ] as const
            ).map((tab) => {
              const active = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-3 py-1 rounded-md transition-all flex items-center space-x-1.5 ${
                    active
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs font-semibold"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                        active
                          ? "bg-zinc-100 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
                          : "bg-zinc-300/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search downloads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Downloads List */}
        {filteredDownloads.length === 0 ? (
          <div className="bg-white dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/80 rounded-xl p-12 text-center text-zinc-400">
            <FolderDown className="w-10 h-10 mx-auto stroke-[1.2] text-zinc-300 dark:text-zinc-700 mb-2" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              No downloads matching criteria
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              Captured browser downloads will stream here in real time.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDownloads.map((item) => {
              const percent =
                item.totalBytes > 0
                  ? Math.min(
                      100,
                      Math.round((item.receivedBytes / item.totalBytes) * 100),
                    )
                  : item.state === "completed"
                    ? 100
                    : 0;

              const isFileMissing = item.state === "file-missing";
              const isPaused = item.state === "paused";
              const isCompleted = item.state === "completed";
              const isFailed =
                item.state === "failed" || item.state === "cancelled";
              const isActive =
                item.state === "aria2-active" ||
                item.state === "handoff-pending" ||
                item.state === "aria2-added";
              const domain = getDomain(item.url);

              return (
                <div
                  key={item.gid || item.browserId}
                  className="group bg-white dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/80 rounded-xl p-3.5 transition-all hover:border-zinc-300 dark:hover:border-zinc-700 shadow-xs"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* File info */}
                    <div className="flex items-start space-x-3 min-w-0 flex-1">
                      <div className="mt-0.5 flex-shrink-0">
                        <FileIcon
                          filename={item.filename || item.url}
                          size={20}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <h2
                            className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate"
                            title={item.filename || item.url}
                          >
                            {item.filename || "Interception pending..."}
                          </h2>
                          {domain && (
                            <span className="text-[10px] text-zinc-400 px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">
                              {domain}
                            </span>
                          )}
                        </div>

                        {isFileMissing ? (
                          <p className="text-[11px] text-rose-500 dark:text-rose-400 mt-0.5">
                            {item.errorMessage ||
                              "File or control metadata missing on disk"}
                          </p>
                        ) : (
                          <p
                            className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5"
                            title={item.url}
                          >
                            {item.url}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status badge & Action buttons */}
                    <div className="flex items-center space-x-2 self-end md:self-center flex-shrink-0">
                      {/* State Badge */}
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                          isFileMissing
                            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900"
                            : isCompleted
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900"
                              : isFailed
                                ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900"
                                : isPaused
                                  ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900"
                                  : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900"
                        }`}
                      >
                        {isFileMissing && (
                          <AlertCircle className="w-2.5 h-2.5" />
                        )}
                        {isCompleted && (
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        )}
                        {isPaused && <Clock className="w-2.5 h-2.5" />}
                        <span>
                          {isFileMissing
                            ? "Missing"
                            : isCompleted
                              ? "Completed"
                              : item.state === "failed"
                                ? "Failed"
                                : item.state === "cancelled"
                                  ? "Cancelled"
                                  : isPaused
                                    ? "Paused"
                                    : "Downloading"}
                        </span>
                      </span>

                      {/* Action buttons */}
                      {item.gid && (
                        <div className="flex items-center space-x-0.5 bg-zinc-50 dark:bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60">
                          {isFileMissing && (
                            <>
                              <button
                                onClick={() => handleRestart(item.gid)}
                                className="p-1.5 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                                title="Restart Download"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDirectRemove(item.gid)}
                                className="p-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 rounded hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {isActive && (
                            <>
                              <button
                                onClick={() => handlePause(item.gid)}
                                className="p-1.5 text-zinc-500 hover:text-amber-500 dark:hover:text-amber-400 rounded hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                                title="Pause"
                              >
                                <Pause className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCancel(item.gid)}
                                className="p-1.5 text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 rounded hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {isPaused && (
                            <>
                              <button
                                onClick={() => handleResume(item.gid)}
                                className="p-1.5 text-zinc-500 hover:text-emerald-500 dark:hover:text-emerald-400 rounded hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                                title="Resume"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCancel(item.gid)}
                                className="p-1.5 text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 rounded hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {(isFailed || isCompleted) && (
                            <>
                              {isFailed && (
                                <button
                                  onClick={() =>
                                    setRefreshingLink({
                                      gid: item.gid,
                                      url: item.url,
                                      filename: item.filename,
                                    })
                                  }
                                  className="p-1.5 text-zinc-500 hover:text-blue-500 dark:hover:text-blue-400 rounded hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                                  title="Refresh Download Link"
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
                                className="p-1.5 text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 rounded hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          <button
                            onClick={() =>
                              handleOpenFolder(item.gid, item.filename)
                            }
                            className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                            title="Show in Folder"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Line */}
                  <div className="mt-3">
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
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
                                  : "bg-blue-600 dark:bg-blue-500"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 font-mono tabular-nums">
                      <span>
                        {item.totalBytes > 0
                          ? `${formatBytes(item.receivedBytes)} of ${formatBytes(item.totalBytes)} (${percent}%)`
                          : formatBytes(item.receivedBytes)}
                      </span>

                      <div className="flex items-center space-x-3">
                        {isActive && item.speed > 0 && (
                          <>
                            <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                              {formatSpeed(item.speed)}
                            </span>
                            {item.totalBytes > item.receivedBytes && (
                              <span className="text-zinc-400">
                                ETA{" "}
                                {formatEta(
                                  (item.totalBytes - item.receivedBytes) /
                                    item.speed,
                                )}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <Footer maxWidth="max-w-6xl" />

      {/* Refresh Download Link Dialog */}
      {refreshingLink && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#141417] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 max-w-lg w-full shadow-modal space-y-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
                <Link2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-white">
                  Refresh Download Link
                </h3>
                <p className="text-xs text-zinc-500">
                  Update the download link for expired CDN tokens or relocated
                  mirrors.
                </p>
              </div>
            </div>

            <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
              {refreshingLink.filename}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                New URL
              </label>
              <textarea
                rows={3}
                value={refreshingLink.url}
                onChange={(e) =>
                  setRefreshingLink({ ...refreshingLink, url: e.target.value })
                }
                placeholder="Paste fresh URL here..."
                className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button
                onClick={() => setRefreshingLink(null)}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleRefreshUrl(
                    refreshingLink.gid,
                    refreshingLink.url.trim(),
                  );
                  setRefreshingLink(null);
                }}
                className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-lg transition-colors"
              >
                Update & Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#141417] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 max-w-md w-full shadow-modal space-y-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-rose-50 dark:bg-rose-950/50 rounded-lg text-rose-600 dark:text-rose-400">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-white">
                  {confirmRemove.isCompleted
                    ? "Remove Completed File"
                    : "Remove Incomplete Task"}
                </h3>
                <p className="text-xs text-zinc-500">
                  {confirmRemove.isCompleted
                    ? "Choose how to handle the downloaded file on disk"
                    : "Confirm removing the incomplete task"}
                </p>
              </div>
            </div>

            <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
              {confirmRemove.filename}
            </div>

            {confirmRemove.isCompleted ? (
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => executeRemove(confirmRemove.gid, false)}
                  className="w-full py-2 px-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium rounded-lg transition-colors text-left flex items-center justify-between"
                >
                  <span>Remove from list only</span>
                  <span className="text-[11px] text-zinc-400">
                    Keep file on disk
                  </span>
                </button>

                <button
                  onClick={() => executeRemove(confirmRemove.gid, true)}
                  className="w-full py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium rounded-lg border border-rose-500/20 transition-colors text-left flex items-center justify-between"
                >
                  <span>Delete file from disk & remove</span>
                  <span className="text-[11px] text-rose-500">
                    Permanently delete
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-zinc-500 leading-normal">
                  This download is incomplete. Removing it will permanently
                  delete any partial files and metadata.
                </p>
                <button
                  onClick={() => executeRemove(confirmRemove.gid, true)}
                  className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors text-center"
                >
                  Delete Partial Files & Remove
                </button>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setConfirmRemove(null)}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Finished Dialog */}
      {confirmClearFinished && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#141417] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 max-w-md w-full shadow-modal space-y-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-amber-50 dark:bg-amber-950/50 rounded-lg text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-white">
                  Clear Finished Downloads
                </h3>
                <p className="text-xs text-zinc-500">
                  Remove all completed, failed, and cancelled downloads from the
                  list.
                </p>
              </div>
            </div>

            <label className="flex items-center space-x-2.5 p-2.5 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={clearDeleteFiles}
                onChange={(e) => setClearDeleteFiles(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                Also permanently delete finished files from disk
              </span>
            </label>

            <div className="pt-2 flex justify-end space-x-2">
              <button
                onClick={() => setConfirmClearFinished(false)}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => executeClearFinished(clearDeleteFiles)}
                className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 px-4 py-1.5 rounded-lg transition-colors"
              >
                Clear All Finished
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
