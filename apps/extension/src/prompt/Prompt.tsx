import React, { useEffect, useState } from "react";
import { formatBytes } from "../utils/format.js";
import { useSystemTheme } from "../utils/useTheme.js";
import { FileIcon } from "../utils/FileIcon.js";
import {
  Download,
  Globe,
  FileText,
  Folder,
  ArrowRight,
  Sliders,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import type { Aria2DownloadOptions } from "@aria2-browser/protocol";

export function Prompt() {
  useSystemTheme();
  const [browserId, setBrowserId] = useState<number>(0);
  const [filename, setFilename] = useState<string>("");
  const [directory, setDirectory] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [size, setSize] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [selectingFolder, setSelectingFolder] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Aria2 custom options
  const [split, setSplit] = useState<number>(5);
  const [maxLimit, setMaxLimit] = useState<string>("0");
  const [subDirectory, setSubDirectory] = useState<string>("");
  const [checksum, setChecksum] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parsedId = parseInt(params.get("id") || "0", 10);
    const parsedFilename = params.get("filename") || "unknown";
    const parsedDir = params.get("dir") || "";
    setBrowserId(parsedId);
    setFilename(parsedFilename);
    setDirectory(parsedDir);
    const parsedUrl = params.get("url") || "";
    setUrl(parsedUrl);
    setSize(parseInt(params.get("size") || "0", 10));

    // Check conflict initially
    chrome.runtime.sendMessage(
      { type: "CHECK_FILE_CONFLICT", payload: { filename: parsedFilename, directory: parsedDir || undefined } },
      (res) => {
        if (res?.success && res.data?.isCompleted) {
          setConflictWarning(`File "${parsedFilename}" already exists in destination folder.`);
        }
      }
    );

    // Extract checksum if embedded in URL hash
    if (parsedUrl.includes("#")) {
      const hash = parsedUrl.slice(parsedUrl.indexOf("#") + 1);
      const match = hash.match(/(sha-?256|sha-?1|md5)=([a-fA-F0-9]+)/i);
      if (match) {
        let algo = match[1].toLowerCase();
        if (algo === "sha256") algo = "sha-256";
        if (algo === "sha1") algo = "sha-1";
        setChecksum(`${algo}=${match[2].toLowerCase()}`);
      }
    }
  }, []);

  const handleBrowseFolder = () => {
    if (selectingFolder) return;
    setSelectingFolder(true);
    const initialDirectory = directory.trim() || undefined;
    chrome.runtime.sendMessage(
      { type: "SELECT_FOLDER", payload: { defaultPath: initialDirectory } },
      (res) => {
        setSelectingFolder(false);
        if (res?.success && res.data?.path && !res.data.canceled) {
          setDirectory(res.data.path);
        }
      }
    );
  };

  const handleDecision = async (action: "aria2" | "browser" | "cancel") => {
    if (submitting) return;

    if (action === "aria2") {
      const chosenFilename = filename.trim() || "download";
      const chosenDirectory = directory.trim() || undefined;

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

    setSubmitting(true);
    setConflictWarning(null);

    const options: Aria2DownloadOptions = {};
    if (action === "aria2") {
      if (split > 0) {
        options.split = split;
        options.maxConnectionPerServer = split;
      }
      if (maxLimit.trim() && maxLimit.trim() !== "0") {
        options.maxDownloadLimit = maxLimit.trim();
      }
      if (subDirectory.trim()) {
        options.subDirectory = subDirectory.trim();
      }
      if (checksum.trim()) {
        options.checksum = checksum.trim();
      }
    }

    chrome.runtime.sendMessage(
      {
        type: "PROMPT_DECISION",
        payload: {
          browserId,
          action,
          filename: filename.trim() || undefined,
          directory: directory.trim() || undefined,
          options: action === "aria2" ? options : undefined,
        },
      },
      () => {
        window.close();
      }
    );
  };

  const getDomain = (rawUrl: string) => {
    try {
      return new URL(rawUrl).hostname;
    } catch {
      return rawUrl;
    }
  };

  return (
    <div className="flex flex-col justify-between min-h-[440px] bg-white dark:bg-[#121215] text-zinc-900 dark:text-zinc-100 rounded-xl p-5 select-none font-sans text-xs border border-zinc-200/80 dark:border-zinc-800/80 shadow-modal antialiased">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center space-x-2.5 pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="w-7 h-7 rounded-lg bg-blue-600/10 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-zinc-900 dark:text-white text-xs">Download Detected</h1>
            <p className="text-[11px] text-zinc-500">
              Confirm save destination or adjust aria2 options
            </p>
          </div>
        </div>

        {/* File preview badge */}
        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 flex items-start space-x-2.5">
          <div className="mt-0.5 flex-shrink-0">
            <FileIcon filename={filename} size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate block">
                {filename}
              </span>
              {size > 0 && (
                <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex-shrink-0 font-medium">
                  {formatBytes(size)}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1 text-zinc-400 text-[10px] mt-0.5 truncate" title={url}>
              <Globe className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{getDomain(url)}</span>
            </div>
          </div>
        </div>

        {/* Conflict Warning */}
        {conflictWarning && (
          <div className="flex items-center space-x-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-md text-rose-600 dark:text-rose-400 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{conflictWarning}</span>
          </div>
        )}

        {/* Inputs */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              File Name
            </label>
            <input
              type="text"
              value={filename}
              onChange={(e) => {
                setFilename(e.target.value);
                setConflictWarning(null);
              }}
              placeholder="filename.zip"
              className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-medium text-zinc-700 dark:text-zinc-300">
                Save Destination
              </label>
              <button
                type="button"
                onClick={handleBrowseFolder}
                disabled={selectingFolder}
                className="px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
              >
                {selectingFolder ? "Choosing..." : "Browse..."}
              </button>
            </div>
            <input
              type="text"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="Default ~/Downloads or custom folder"
              className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Aria2 Options Accordion */}
        <div>
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center space-x-1 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs font-medium transition-colors"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Advanced aria2 options</span>
            {showOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showOptions && (
            <div className="mt-2 space-y-2.5 bg-zinc-50/80 dark:bg-zinc-900/40 p-3 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-600 dark:text-zinc-300 font-medium">Connections / Split:</span>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="1"
                    max="16"
                    value={split}
                    onChange={(e) => setSplit(parseInt(e.target.value, 10))}
                    className="w-24 accent-blue-600"
                  />
                  <span className="w-4 text-right font-mono font-bold">{split}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-600 dark:text-zinc-300 font-medium">Speed Limit (0=unlimited):</span>
                <input
                  type="text"
                  value={maxLimit}
                  onChange={(e) => setMaxLimit(e.target.value)}
                  placeholder="e.g. 5M"
                  className="w-20 px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-right font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-600 dark:text-zinc-300 font-medium">Sub-Directory:</span>
                <input
                  type="text"
                  value={subDirectory}
                  onChange={(e) => setSubDirectory(e.target.value)}
                  placeholder="e.g. ISOs"
                  className="w-28 px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-mono text-xs"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <span className="text-zinc-600 dark:text-zinc-300 font-medium">Checksum Verification:</span>
                <input
                  type="text"
                  value={checksum}
                  onChange={(e) => setChecksum(e.target.value)}
                  placeholder="sha-256=... or md5=..."
                  className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-mono text-[10px]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
        <button
          onClick={() => handleDecision("cancel")}
          disabled={submitting}
          className="text-zinc-400 hover:text-rose-500 text-xs transition-colors"
        >
          Cancel
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleDecision("browser")}
            disabled={submitting}
            className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Keep in Browser
          </button>
          <button
            onClick={() => handleDecision("aria2")}
            disabled={submitting}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center space-x-1.5"
          >
            <span>Download (aria2c)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
