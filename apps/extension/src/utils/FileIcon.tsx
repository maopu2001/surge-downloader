import React from "react";
import {
  File,
  FileArchive,
  FileVideo,
  FileAudio,
  FileImage,
  FileCode,
  FileText,
  Package,
} from "lucide-react";

interface FileIconProps {
  filename?: string;
  className?: string;
  size?: number;
}

export function FileIcon({ filename = "", className = "", size = 16 }: FileIconProps) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (["zip", "tar", "gz", "tgz", "7z", "rar", "bz2", "xz"].includes(ext)) {
    return <FileArchive size={size} className={`text-amber-500 ${className}`} />;
  }

  if (["iso", "dmg", "exe", "msi", "deb", "rpm", "pkg", "appimage"].includes(ext)) {
    return <Package size={size} className={`text-purple-500 ${className}`} />;
  }

  if (["mp4", "mkv", "avi", "mov", "webm", "flv", "m4v"].includes(ext)) {
    return <FileVideo size={size} className={`text-sky-500 ${className}`} />;
  }

  if (["mp3", "flac", "wav", "aac", "ogg", "m4a"].includes(ext)) {
    return <FileAudio size={size} className={`text-emerald-500 ${className}`} />;
  }

  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "tiff"].includes(ext)) {
    return <FileImage size={size} className={`text-pink-500 ${className}`} />;
  }

  if (["js", "ts", "jsx", "tsx", "py", "rs", "go", "java", "c", "cpp", "json", "xml", "html", "css", "sql"].includes(ext)) {
    return <FileCode size={size} className={`text-indigo-500 ${className}`} />;
  }

  if (["pdf", "docx", "doc", "txt", "md", "csv", "xlsx", "pptx"].includes(ext)) {
    return <FileText size={size} className={`text-blue-500 ${className}`} />;
  }

  return <File size={size} className={`text-neutral-400 dark:text-neutral-500 ${className}`} />;
}
