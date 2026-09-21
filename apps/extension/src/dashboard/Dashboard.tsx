import React, { useEffect, useState, useMemo } from "react";
import type { DownloadBinding } from "@aria2-browser/protocol";
import { formatBytes, formatSpeed, formatEta } from "../utils/format.js";
import { useSystemTheme } from "../utils/useTheme.js";
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
  const [refreshingLink, setRefreshingLink] = useState<{ gid: string; url: string; filename: string } | null>(null);

  const refresh = () => {
    chrome.runtime.sendMessage({ type: "GET_DOWNLOADS" }, (res) => {
      if (res?.success) setDownloads(res.data);
    });

    chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (res) => {
      if (res?.success && res.data.nativeHost.ok) {
        setIsConnected(true);
        if (res.data.aria2c.ok) {
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
      prev.map((d) => (d.gid === gid ? { ...d, state: "paused", speed: 0 } : d))
    );
    chrome.runtime.sendMessage({ type: "PAUSE_DOWNLOAD", payload: { gid } }, () => refresh());
  };

  const handleResume = (gid: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.gid === gid ? { ...d, state: "aria2-active" } : d))
    );
    chrome.runtime.sendMessage({ type: "RESUME_DOWNLOAD", payload: { gid } }, () => refresh());
  };

  const handleCancel = (gid: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.gid === gid ? { ...d, state: "cancelled", speed: 0 } : d))
    );
    chrome.runtime.sendMessage({ type: "CANCEL_DOWNLOAD", payload: { gid } }, () => refresh());
  };

  const handleRefreshUrl = (gid: string, newUrl: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.gid === gid ? { ...d, url: newUrl, state: "aria2-active" } : d))
    );
    chrome.runtime.sendMessage(
      { type: "REFRESH_DOWNLOAD_URL", payload: { gid, newUrl } },
      () => refresh()
    );
  };

  const handleOpenFolder = (gid?: string, filename?: string) => {
    chrome.runtime.sendMessage({ type: "OPEN_IN_FOLDER", payload: { gid, filename } });
  };

  const executeRemove = (gid: string, deleteFile: boolean) => {
    setDownloads((prev) => prev.filter((d) => d.gid !== gid));
    setConfirmRemove(null);
    chrome.runtime.sendMessage({ type: "REMOVE_DOWNLOAD", payload: { gid, deleteFile } }, () =>
      refresh()
    );
  };

  const handleDirectRemove = (gid: string) => {
    setDownloads((prev) => prev.filter((d) => d.gid !== gid));
    chrome.runtime.sendMessage({ type: "REMOVE_DOWNLOAD", payload: { gid, deleteFile: true } }, () =>
      refresh()
    );
  };

  const handleRestart = (gid: string) => {
    chrome.runtime.sendMessage({ type: "RESTART_DOWNLOAD", payload: { gid } }, () =>
      refresh()
    );
  };

  const handlePauseAll = () => {
    setDownloads((prev) =>
      prev.map((d) => (d.state === "aria2-active" ? { ...d, state: "paused", speed: 0 } : d))
    );
    chrome.runtime.sendMessage({ type: "PAUSE_ALL_DOWNLOADS" }, () => refresh());
  };

  const handleResumeAll = () => {
    setDownloads((prev) =>
      prev.map((d) => (d.state === "paused" ? { ...d, state: "aria2-active" } : d))
    );
    chrome.runtime.sendMessage({ type: "RESUME_ALL_DOWNLOADS" }, () => refresh());
  };

  const executeClearFinished = (deleteFiles: boolean) => {
    setDownloads((prev) =>
      prev.filter(
        (d) =>
          d.state !== "completed" &&
          d.state !== "failed" &&
          d.state !== "cancelled" &&
          d.state !== "file-missing"
      )
    );
    setConfirmClearFinished(false);
    chrome.runtime.sendMessage({ type: "CLEAR_FINISHED_DOWNLOADS", payload: { deleteFiles } }, () =>
      refresh()
    );
  };

  const handleSync = () => {
    chrome.runtime.sendMessage({ type: "SYNC_DOWNLOADS" }, () => refresh());
  };

  const filteredDownloads = useMemo(() => {
    return downloads.filter((d) => {
      const matchSearch =
        d.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.url.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;

      const isPaused = d.state === "paused";
      if (filterTab === "active") {
        return d.state === "aria2-active" && d.speed > 0;
      }
      if (filterTab === "completed") {
        return d.state === "completed";
      }
      if (filterTab === "paused") {
        return isPaused;
      }
      if (filterTab === "failed") {
        return d.state === "failed" || d.state === "cancelled" || d.state === "file-missing";
      }
      return true;
    });
  }, [downloads, filterTab, searchQuery]);

  const totalSpeed = useMemo(() => {
    return downloads.reduce((acc, d) => acc + (d.speed || 0), 0);
  }, [downloads]);

  const hasActiveDownloads = downloads.some((d) => d.state === "aria2-active");
  const hasFinishedDownloads = downloads.some(
    (d) =>
      d.state === "completed" ||
      d.state === "failed" ||
      d.state === "cancelled" ||
      d.state === "file-missing"
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* Top Navbar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/icons/icon-48.png" alt="Surge" className="w-10 h-10 rounded-xl shadow-sm" />
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-none">Surge Downloads</h1>
              <div className="flex items-center space-x-2 mt-1.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                  }`}
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isConnected ? (ariaInfo || "Connected") : "Native Host Offline"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex flex-col text-right pr-2">
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Total Speed</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{formatSpeed(totalSpeed)}</span>
            </div>

            {hasActiveDownloads && (
              <>
                <button
                  onClick={handlePauseAll}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                  title="Pause All"
                >
                  <Pause className="w-3.5 h-3.5 fill-current text-amber-500" />
                  <span className="hidden sm:inline">Pause All</span>
                </button>

                <button
                  onClick={handleResumeAll}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                  title="Resume All"
                >
                  <Play className="w-3.5 h-3.5 fill-current text-emerald-500" />
                  <span className="hidden sm:inline">Resume All</span>
                </button>
              </>
            )}

            {hasFinishedDownloads && (
              <button
                onClick={() => setConfirmClearFinished(true)}
                className="inline-flex items-center space-x-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 transition-colors shadow-sm"
                title="Clear Completed / Cancelled"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Finished</span>
              </button>
            )}

            <button
              onClick={handleSync}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
              title="Sync with aria2c"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync</span>
            </button>

            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Filter Controls & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-1 bg-slate-200/80 dark:bg-slate-900 p-1 rounded-xl text-xs font-medium self-start border border-slate-300/50 dark:border-slate-800">
            {(
              [
                { id: "all", label: "All" },
                { id: "active", label: "Downloading" },
                { id: "completed", label: "Completed" },
                { id: "paused", label: "Paused" },
                { id: "failed", label: "Failed/Cancelled" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterTab === tab.id
                    ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 font-bold shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search filename or URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-900 dark:text-slate-100 shadow-sm"
            />
          </div>
        </div>

        {/* Task Cards List */}
        {filteredDownloads.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 dark:text-slate-600 shadow-sm">
            <FolderDown className="w-12 h-12 mx-auto stroke-[1.2] text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">No downloads matching criteria</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Downloads captured from Chromium will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDownloads.map((item) => {
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
                  className={`bg-white dark:bg-slate-900 border rounded-xl p-4 shadow-sm hover:shadow transition-all ${
                    isFileMissing
                      ? "border-rose-300 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10"
                      : "border-slate-200/80 dark:border-slate-800"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h2
                          className="font-semibold text-sm text-slate-900 dark:text-white truncate"
                          title={item.filename || item.url}
                        >
                          {item.filename || "Interception pending..."}
                        </h2>
                        {/* State Tag */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isFileMissing
                              ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                              : isCompleted
                              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                              : isFailed
                              ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                              : isPaused
                              ? "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                              : "bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800"
                          }`}
                        >
                          {isFileMissing
                            ? "File Missing"
                            : isCompleted
                            ? "Complete"
                            : item.state === "failed"
                            ? "Failed"
                            : item.state === "cancelled"
                            ? "Cancelled"
                            : isPaused
                            ? "Paused"
                            : "Downloading"}
                        </span>
                      </div>
                      {isFileMissing ? (
                        <p
                          className="text-xs text-rose-500 dark:text-rose-400 font-medium truncate mt-1"
                          title={item.errorMessage || "File or .aria2 control file was deleted from folder"}
                        >
                          {item.errorMessage || "File or .aria2 control file was deleted from folder"}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-1" title={item.url}>
                          {item.url}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 self-end md:self-center flex-shrink-0">
                      {item.gid && (
                        <>
                          {/* File Missing: Restart, Remove (no prompt) */}
                          {isFileMissing && (
                            <>
                              <button
                                onClick={() => handleRestart(item.gid)}
                                className="p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-sky-200 dark:border-sky-800/80 rounded-lg transition-colors flex items-center space-x-1"
                                title="Restart Download"
                              >
                                <RefreshCw className="w-4 h-4" />
                                <span className="text-xs font-semibold hidden sm:inline">Restart</span>
                              </button>
                              <button
                                onClick={() => handleDirectRemove(item.gid)}
                                className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-lg transition-colors flex items-center space-x-1"
                                title="Remove directly without prompt"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span className="text-xs font-semibold hidden sm:inline">Remove</span>
                              </button>
                            </>
                          )}

                          {/* Downloading: pause, cancel, show in folder */}
                          {isActive && (
                            <>
                              <button
                                onClick={() => handlePause(item.gid)}
                                className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-lg transition-colors"
                                title="Pause Download"
                              >
                                <Pause className="w-4 h-4 fill-current" />
                              </button>
                              <button
                                onClick={() => handleCancel(item.gid)}
                                className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-lg transition-colors"
                                title="Cancel Download"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenFolder(item.gid, item.filename)}
                                className="p-1.5 text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
                                title="Show in Folder"
                              >
                                <FolderOpen className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {/* Paused: resume, cancel, show in folder */}
                          {isPaused && (
                            <>
                              <button
                                onClick={() => handleResume(item.gid)}
                                className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-lg transition-colors"
                                title="Resume Download"
                              >
                                <Play className="w-4 h-4 fill-current" />
                              </button>
                              <button
                                onClick={() => handleCancel(item.gid)}
                                className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-lg transition-colors"
                                title="Cancel Download"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenFolder(item.gid, item.filename)}
                                className="p-1.5 text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
                                title="Show in Folder"
                              >
                                <FolderOpen className="w-4 h-4" />
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
                                className="p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-sky-200 dark:border-sky-800/80 rounded-lg transition-colors"
                                title="Refresh Link"
                              >
                                <Link2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() =>
                                  setConfirmRemove({
                                    gid: item.gid,
                                    filename: item.filename || "download",
                                    isCompleted: false,
                                  })
                                }
                                className="p-1.5 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
                                title="Remove"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenFolder(item.gid, item.filename)}
                                className="p-1.5 text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
                                title="Show in Folder"
                              >
                                <FolderOpen className="w-4 h-4" />
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
                                className="p-1.5 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
                                title="Remove"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenFolder(item.gid, item.filename)}
                                className="p-1.5 text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
                                title="Show in Folder"
                              >
                                <FolderOpen className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress details */}
                  <div className="mt-3">
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
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

                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-2">
                      <span className="font-medium">
                        {isFileMissing ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold uppercase text-[11px] tracking-wider">
                            File Missing on Disk
                          </span>
                        ) : (
                          `${formatBytes(item.receivedBytes)} of ${formatBytes(item.totalBytes)} (${percent}%)`
                        )}
                      </span>
                      <div className="flex items-center space-x-3">
                        {isActive && item.speed > 0 && (
                          <>
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              {formatSpeed(item.speed)}
                            </span>
                            {item.totalBytes > item.receivedBytes && (
                              <span>
                                ETA: {formatEta((item.totalBytes - item.receivedBytes) / item.speed)}
                              </span>
                            )}
                          </>
                        )}
                        {item.errorMessage && (
                          <span className="text-rose-500 dark:text-rose-400 font-medium">{item.errorMessage}</span>
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

      {/* Refresh Download Link Dialog */}
      {refreshingLink && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-sky-100 dark:bg-sky-950/60 rounded-xl text-sky-600 dark:text-sky-400">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Refresh Download Link</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Update the download link for expired tokens or refreshed CDN mirrors.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              {refreshingLink.filename}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                New Download URL
              </label>
              <textarea
                rows={3}
                value={refreshingLink.url}
                onChange={(e) => setRefreshingLink({ ...refreshingLink, url: e.target.value })}
                placeholder="Paste fresh download link / token here..."
                className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button
                onClick={() => setRefreshingLink(null)}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleRefreshUrl(refreshingLink.gid, refreshingLink.url.trim());
                  setRefreshingLink(null);
                }}
                className="text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 px-5 py-2 rounded-xl shadow-sm transition-colors"
              >
                Update & Resume Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-rose-100 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {confirmRemove.isCompleted ? "Remove Completed Download" : "Remove Incomplete Download"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {confirmRemove.isCompleted
                    ? "Choose how to remove this completed file"
                    : "Confirm removing incomplete download"}
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              {confirmRemove.filename}
            </div>

            {confirmRemove.isCompleted ? (
              <div className="space-y-2.5 pt-1">
                <button
                  onClick={() => executeRemove(confirmRemove.gid, false)}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors text-left flex items-center justify-between"
                >
                  <span>Remove from list only</span>
                  <span className="text-[11px] text-slate-400 font-normal">Keep file on disk</span>
                </button>

                <button
                  onClick={() => executeRemove(confirmRemove.gid, true)}
                  className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-800 transition-colors text-left flex items-center justify-between"
                >
                  <span>Delete file from disk & remove</span>
                  <span className="text-[11px] text-rose-400 font-normal">Permanently delete</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 leading-relaxed">
                  This download is not complete. Removing it will also permanently delete any partial files and resume metadata from disk.
                </p>
                <button
                  onClick={() => executeRemove(confirmRemove.gid, true)}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors text-center"
                >
                  Delete Partial Files & Remove
                </button>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setConfirmRemove(null)}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Finished Dialog */}
      {confirmClearFinished && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Clear Finished Downloads</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Remove all completed, failed, and cancelled downloads from the list.
                </p>
              </div>
            </div>

            <label className="flex items-center space-x-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={clearDeleteFiles}
                onChange={(e) => setClearDeleteFiles(e.target.checked)}
                className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
              />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Also permanently delete downloaded files from disk
              </span>
            </label>

            <div className="pt-2 flex justify-end space-x-2">
              <button
                onClick={() => setConfirmClearFinished(false)}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => executeClearFinished(clearDeleteFiles)}
                className="text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-4 py-2 rounded-xl shadow-sm transition-colors"
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
