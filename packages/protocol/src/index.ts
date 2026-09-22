import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

export const ErrorCode = {
  INVALID_MESSAGE: "INVALID_MESSAGE",
  INVALID_URL: "INVALID_URL",
  INVALID_DIRECTORY: "INVALID_DIRECTORY",
  ARIA2_UNAVAILABLE: "ARIA2_UNAVAILABLE",
  ARIA2_ADD_FAILED: "ARIA2_ADD_FAILED",
  GID_NOT_FOUND: "GID_NOT_FOUND",
  FILE_ALREADY_EXISTS: "FILE_ALREADY_EXISTS",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ProtocolEnvelope<T = unknown> {
  protocolVersion: 1;
  type: string;
  requestId?: string;
  payload: T;
}

export const EnvelopeSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.string(),
  requestId: z.string().optional(),
  payload: z.unknown(),
});

// Payloads
export const PingPayloadSchema = z.object({});
export type PingPayload = z.infer<typeof PingPayloadSchema>;

export const PongPayloadSchema = z.object({
  timestamp: z.number(),
});
export type PongPayload = z.infer<typeof PongPayloadSchema>;

export const Aria2StatusPayloadSchema = z.object({});
export type Aria2StatusPayload = z.infer<typeof Aria2StatusPayloadSchema>;

export const Aria2ReadyPayloadSchema = z.object({
  version: z.string(),
  port: z.number(),
});
export type Aria2ReadyPayload = z.infer<typeof Aria2ReadyPayloadSchema>;

export const DownloadAddHeadersSchema = z.object({
  referer: z.string().optional(),
  userAgent: z.string().optional(),
  cookie: z.string().optional(),
  accept: z.string().optional(),
  acceptLanguage: z.string().optional(),
  secChUa: z.string().optional(),
  customHeaders: z.array(z.string()).optional(),
}).optional();

export const Aria2DownloadOptionsSchema = z.object({
  split: z.number().int().min(1).max(16).optional(),
  maxConnectionPerServer: z.number().int().min(1).max(16).optional(),
  minSplitSize: z.string().regex(/^\d+[kKmMgG]?$/).optional(),
  maxDownloadLimit: z.string().regex(/^\d+[kKmMgG]?$/).optional(),
  lowestSpeedLimit: z.string().regex(/^\d+[kKmMgG]?$/).optional(),
  allProxy: z.string().optional(),
  checksum: z.string().regex(/^(sha-256|sha-1|md5)=[a-fA-F0-9]+$/).optional(),
  autoFileRenaming: z.boolean().optional(),
  allowOverwrite: z.boolean().optional(),
  continueDownload: z.boolean().optional(),
  maxTries: z.number().int().min(1).max(30).optional(),
  retryWait: z.number().int().min(1).max(60).optional(),
  timeout: z.number().int().min(5).max(300).optional(),
  connectTimeout: z.number().int().min(5).max(120).optional(),
  checkCertificate: z.boolean().optional(),
  subDirectory: z.string().optional(),
  pause: z.boolean().optional(),
}).strict().optional();

export type Aria2DownloadOptions = z.infer<typeof Aria2DownloadOptionsSchema>;

export const DownloadAddPayloadSchema = z.object({
  url: z.union([z.string(), z.array(z.string()).min(1)]),
  filename: z.string().optional(),
  directory: z.string().optional(),
  headers: DownloadAddHeadersSchema,
  options: Aria2DownloadOptionsSchema,
});
export type DownloadAddPayload = z.infer<typeof DownloadAddPayloadSchema>;

export const DownloadAddedPayloadSchema = z.object({
  gid: z.string(),
  url: z.string(),
});
export type DownloadAddedPayload = z.infer<typeof DownloadAddedPayloadSchema>;

export const GidPayloadSchema = z.object({
  gid: z.string(),
  filename: z.string().optional(),
  directory: z.string().optional(),
  deleteFile: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
});
export type GidPayload = z.infer<typeof GidPayloadSchema>;

export const DownloadRefreshUrlPayloadSchema = z.object({
  gid: z.string(),
  newUrl: z.string(),
  filename: z.string().optional(),
  directory: z.string().optional(),
  headers: DownloadAddHeadersSchema,
  options: Aria2DownloadOptionsSchema,
});
export type DownloadRefreshUrlPayload = z.infer<typeof DownloadRefreshUrlPayloadSchema>;

export const DownloadOpenFolderPayloadSchema = z.object({
  gid: z.string().optional(),
  directory: z.string().optional(),
  filename: z.string().optional(),
});
export type DownloadOpenFolderPayload = z.infer<typeof DownloadOpenFolderPayloadSchema>;

export const DownloadFolderOpenedPayloadSchema = z.object({
  success: z.boolean(),
  path: z.string().optional(),
  error: z.string().optional(),
});
export type DownloadFolderOpenedPayload = z.infer<typeof DownloadFolderOpenedPayloadSchema>;

export const SelectFolderPayloadSchema = z.object({
  prompt: z.string().optional(),
  defaultPath: z.string().optional(),
});
export type SelectFolderPayload = z.infer<typeof SelectFolderPayloadSchema>;

export const SelectFolderResultPayloadSchema = z.object({
  canceled: z.boolean(),
  path: z.string().optional(),
  error: z.string().optional(),
});
export type SelectFolderResultPayload = z.infer<typeof SelectFolderResultPayloadSchema>;

export const CheckFileExistsPayloadSchema = z.object({
  filename: z.string(),
  directory: z.string().optional(),
});
export type CheckFileExistsPayload = z.infer<typeof CheckFileExistsPayloadSchema>;

export const CheckFileExistsResultSchema = z.object({
  exists: z.boolean(),
  path: z.string(),
  isCompleted: z.boolean(),
});
export type CheckFileExistsResult = z.infer<typeof CheckFileExistsResultSchema>;

export const CheckFilesStatusItemSchema = z.object({
  gid: z.string(),
  filename: z.string(),
  directory: z.string().optional(),
  isCompleted: z.boolean(),
});
export type CheckFilesStatusItem = z.infer<typeof CheckFilesStatusItemSchema>;

export const CheckFilesStatusPayloadSchema = z.object({
  items: z.array(CheckFilesStatusItemSchema),
});
export type CheckFilesStatusPayload = z.infer<typeof CheckFilesStatusPayloadSchema>;

export const FileStatusResultItemSchema = z.object({
  gid: z.string(),
  missing: z.boolean(),
  reason: z.string().optional(),
});
export type FileStatusResultItem = z.infer<typeof FileStatusResultItemSchema>;

export const FilesStatusResultPayloadSchema = z.object({
  results: z.array(FileStatusResultItemSchema),
});
export type FilesStatusResultPayload = z.infer<typeof FilesStatusResultPayloadSchema>;

export const DownloadRestartPayloadSchema = z.object({
  gid: z.string(),
});
export type DownloadRestartPayload = z.infer<typeof DownloadRestartPayloadSchema>;

export interface PendingPromptItem {
  id: number;
  url: string;
  finalUrl?: string;
  filename: string;
  size: number;
  directory: string;
  hasConflict?: boolean;
}

export interface AwaitingRefreshState {
  gid: string;
  filename: string;
  directory?: string;
  originalUrl: string;
  startedAt: number;
  timeoutSeconds: number;
}

export interface RefreshPromptItem {
  targetGid: string;
  targetFilename: string;
  newUrl: string;
  newFilename: string;
  newDomain: string;
  originalDomain: string;
  browserDownloadId: number;
}

export const DownloadSyncPayloadSchema = z.object({});
export type DownloadSyncPayload = z.infer<typeof DownloadSyncPayloadSchema>;

export const DownloadStatusSchema = z.enum([
  "active",
  "waiting",
  "paused",
  "error",
  "complete",
  "removed",
]);
export type DownloadStatus = z.infer<typeof DownloadStatusSchema>;

export const DownloadProgressPayloadSchema = z.object({
  gid: z.string(),
  status: DownloadStatusSchema,
  completedBytes: z.number(),
  totalBytes: z.number(),
  downloadSpeed: z.number(),
  uploadSpeed: z.number(),
  etaSeconds: z.number().optional(),
  errorMessage: z.string().optional(),
});
export type DownloadProgressPayload = z.infer<typeof DownloadProgressPayloadSchema>;

export const ErrorPayloadSchema = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

// Download Binding Record
export type DownloadBindingState =
  | "browser-active"
  | "handoff-pending"
  | "aria2-added"
  | "browser-cancel-pending"
  | "aria2-active"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "file-missing";

export interface DownloadBinding {
  browserId: number;
  gid: string;
  state: DownloadBindingState;
  url: string;
  filename: string;
  totalBytes: number;
  receivedBytes: number;
  speed: number;
  createdAt: number;
  updatedAt: number;
  errorMessage?: string;
  directory?: string;
}

// Rules & Settings
export type InterceptionMode = "off" | "ask" | "auto";

export const DEFAULT_INTERCEPT_EXTENSIONS = [
  // Archives
  "zip", "tar", "tar.gz", "tgz", "7z", "rar", "bz2", "xz",
  // Disk Images
  "iso", "dmg", "img", "vhd",
  // Installers / Packages
  "exe", "msi", "apk", "deb", "rpm", "pkg",
  // Media
  "mp4", "mkv", "avi", "flv", "mov", "mp3", "flac", "wav"
];

export interface SubDirectoryRoute {
  pattern: string; // extension or wildcard or mime (e.g. "iso", "*.zip", "video/*")
  subDirectory: string; // e.g. "ISOs", "Videos"
}

export interface ExtensionSettings {
  mode: InterceptionMode;
  interceptAll: boolean;
  excludedDomains: string[];
  excludedExtensions: string[];
  includedDomains: string[];
  includedExtensions: string[];
  mimePatterns: string[];
  downloadDirectory: string;
  forwardCookies: boolean;
  forwardUserAgent: boolean;
  forwardReferer: boolean;
  rpcPort?: number;
  rpcSecret?: string;
  // Aria2 Engine & Interceptor feature options
  defaultSplit: number;
  defaultMaxConnectionPerServer: number;
  defaultMinSplitSize: string;
  defaultMaxDownloadLimit: string;
  defaultProxy: string;
  defaultCheckCertificate: boolean;
  autoFileRenaming: boolean;
  allowOverwrite: boolean;
  refreshCaptureTimeoutSeconds: number;
  subDirectoryRouting: SubDirectoryRoute[];
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  mode: "auto",
  interceptAll: true,
  excludedDomains: [],
  excludedExtensions: ["crx"],
  includedDomains: [],
  includedExtensions: DEFAULT_INTERCEPT_EXTENSIONS,
  mimePatterns: ["application/x-iso9660-image", "video/*", "application/octet-stream"],
  downloadDirectory: "~/Downloads/Surge",
  forwardCookies: true,
  forwardUserAgent: true,
  forwardReferer: true,
  rpcPort: 6800,
  rpcSecret: "",
  defaultSplit: 8,
  defaultMaxConnectionPerServer: 5,
  defaultMinSplitSize: "5M",
  defaultMaxDownloadLimit: "0",
  defaultProxy: "",
  defaultCheckCertificate: true,
  autoFileRenaming: true,
  allowOverwrite: false,
  refreshCaptureTimeoutSeconds: 30,
  subDirectoryRouting: [
    { pattern: "iso,dmg,img,vhd", subDirectory: "DiskImages" },
    { pattern: "mp4,mkv,avi,flv,mov,webm,video/*", subDirectory: "Videos" },
    { pattern: "mp3,flac,wav,aac,ogg,m4a,audio/*", subDirectory: "Audio" },
    { pattern: "jpg,jpeg,png,gif,webp,svg,bmp,ico,tiff,heic,avif,image/*", subDirectory: "Images" },
    { pattern: "zip,tar,tar.gz,tgz,7z,rar,bz2,xz", subDirectory: "Archives" },
    { pattern: "exe,msi,apk,deb,rpm,pkg", subDirectory: "Installers" },
    { pattern: "pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv,epub", subDirectory: "Documents" },
    { pattern: "*", subDirectory: "Others" },
  ],
};

// Envelope creation helpers
export function createEnvelope<T>(
  type: string,
  payload: T,
  requestId?: string
): ProtocolEnvelope<T> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type,
    requestId,
    payload,
  };
}

export function createErrorEnvelope(
  code: ErrorCode,
  message: string,
  requestId?: string,
  details?: unknown
): ProtocolEnvelope<ErrorPayload> {
  return createEnvelope(
    "error",
    { code, message, details },
    requestId
  );
}
