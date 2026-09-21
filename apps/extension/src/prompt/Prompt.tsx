import React, { useEffect, useState } from "react";
import { formatBytes } from "../utils/format.js";
import { useSystemTheme } from "../utils/useTheme.js";
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
          setConflictWarning(`File "${parsedFilename}" already exists in destination folder. Please rename.`);
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
        setConflictWarning(`File "${chosenFilename}" already exists in destination folder. Please rename.`);
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

  return (
    <div className="flex flex-col justify-between min-h-[460px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-xl p-5 select-none font-sans text-xs border border-slate-200 dark:border-slate-800 shadow-lg transition-colors">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <img src="/icons/icon-48.png" alt="Surge" className="w-8 h-8 rounded-lg shadow-sm" />
          <div>
            <h1 className="font-bold text-slate-900 dark:text-white text-sm">Surge Download Detected</h1>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Customize file name and folder before downloading
            </p>
          </div>
        </div>

        {/* URL & Size Summary */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/70 dark:border-slate-700/60 space-y-1.5">
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
            <span className="font-medium">Detected Size:</span>
            <span className="font-semibold text-slate-900 dark:text-white font-mono">
              {size > 0 ? formatBytes(size) : "Unknown size"}
            </span>
          </div>
          <div className="flex items-start space-x-1.5 text-slate-500 dark:text-slate-400">
            <Globe className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="truncate text-[11px]" title={url}>
              {url}
            </span>
          </div>
        </div>

        {/* Conflict Warning */}
        {conflictWarning && (
          <div className="flex items-start space-x-2 p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-700 dark:text-rose-300 text-xs font-medium leading-snug">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-500 mt-0.5" />
            <span>{conflictWarning}</span>
          </div>
        )}

        {/* Change File Name & Folder */}
        <div className="space-y-3">
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold text-xs mb-1 flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-sky-500" />
              <span>File Name:</span>
            </label>
            <input
              type="text"
              value={filename}
              onChange={(e) => {
                setFilename(e.target.value);
                setConflictWarning(null);
              }}
              placeholder="e.g. filename.zip"
              className={`w-full px-3 py-1.5 bg-white dark:bg-slate-950 border rounded-lg text-slate-900 dark:text-slate-100 font-mono text-xs focus:ring-2 ${
                conflictWarning
                  ? "border-rose-400 dark:border-rose-600 focus:ring-rose-500"
                  : "border-slate-300 dark:border-slate-700 focus:ring-sky-500 focus:border-sky-500"
              }`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center space-x-1.5">
                <Folder className="w-3.5 h-3.5 text-sky-500" />
                <span>Save Folder:</span>
              </label>
              <button
                type="button"
                onClick={handleBrowseFolder}
                disabled={selectingFolder}
                className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 text-sky-600 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded font-semibold text-[11px] transition-colors flex items-center space-x-1"
              >
                <Folder className="w-3 h-3" />
                <span>{selectingFolder ? "Choosing..." : "Choose Folder"}</span>
              </button>
            </div>
            <input
              type="text"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="Default ~/Downloads or choose folder"
              className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono text-xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
        </div>

        {/* Aria2 Options Accordion */}
        <div>
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center space-x-1 text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 font-medium transition-colors"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>More Aria2 Options</span>
            {showOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showOptions && (
            <div className="mt-2 space-y-2.5 bg-slate-50/80 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Connections / Split:</span>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="1"
                    max="16"
                    value={split}
                    onChange={(e) => setSplit(parseInt(e.target.value, 10))}
                    className="w-24 accent-sky-500"
                  />
                  <span className="w-5 text-right font-mono font-semibold">{split}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Speed Limit (0=unlimited):</span>
                <input
                  type="text"
                  value={maxLimit}
                  onChange={(e) => setMaxLimit(e.target.value)}
                  placeholder="e.g. 5M"
                  className="w-24 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-right font-mono"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Sub-Folder Category:</span>
                <input
                  type="text"
                  value={subDirectory}
                  onChange={(e) => setSubDirectory(e.target.value)}
                  placeholder="e.g. ISOs"
                  className="w-32 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Checksum Verification:</span>
                <input
                  type="text"
                  value={checksum}
                  onChange={(e) => setChecksum(e.target.value)}
                  placeholder="sha-256=abcdef... or md5=..."
                  className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono text-[10px]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={() => handleDecision("cancel")}
          disabled={submitting}
          className="px-3.5 py-2 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
        >
          Cancel Download
        </button>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleDecision("browser")}
            disabled={submitting}
            className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Keep in Browser
          </button>
          <button
            onClick={() => handleDecision("aria2")}
            disabled={submitting}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white font-bold rounded-lg shadow-sm transition-colors flex items-center space-x-1.5"
          >
            <span>Download with aria2c</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
