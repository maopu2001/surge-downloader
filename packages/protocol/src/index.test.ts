import { describe, it, expect } from "vitest";
import {
  createEnvelope,
  createErrorEnvelope,
  ErrorCode,
  EnvelopeSchema,
  DownloadAddPayloadSchema,
  DownloadRefreshUrlPayloadSchema,
} from "./index.js";

describe("Protocol Envelopes", () => {
  it("creates valid envelope", () => {
    const env = createEnvelope("ping", {}, "req-1");
    expect(env.protocolVersion).toBe(1);
    expect(env.type).toBe("ping");
    expect(env.requestId).toBe("req-1");
    expect(EnvelopeSchema.safeParse(env).success).toBe(true);
  });

  it("creates valid error envelope", () => {
    const errEnv = createErrorEnvelope(
      ErrorCode.INVALID_URL,
      "Invalid scheme",
      "req-2",
      { scheme: "blob:" }
    );
    expect(errEnv.type).toBe("error");
    expect(errEnv.payload.code).toBe(ErrorCode.INVALID_URL);
    expect(errEnv.payload.message).toBe("Invalid scheme");
  });

  it("validates download.add payload with options and mirrors", () => {
    const valid = DownloadAddPayloadSchema.safeParse({
      url: ["https://example.com/file.iso", "https://mirror.com/file.iso"],
      filename: "file.iso",
      directory: "/Downloads",
      headers: {
        userAgent: "Mozilla/5.0",
      },
      options: {
        split: 8,
        maxConnectionPerServer: 8,
        minSplitSize: "5M",
        maxDownloadLimit: "2M",
        allProxy: "socks5://127.0.0.1:1080",
        checksum: "sha-256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        autoFileRenaming: true,
        allowOverwrite: false,
        continueDownload: true,
        checkCertificate: true,
        subDirectory: "ISOs",
        pause: false,
      },
    });
    expect(valid.success).toBe(true);

    const invalidSplit = DownloadAddPayloadSchema.safeParse({
      url: "https://example.com/file.iso",
      options: {
        split: 32, // aria2 max is 16
      },
    });
    expect(invalidSplit.success).toBe(false);

    const invalidChecksum = DownloadAddPayloadSchema.safeParse({
      url: "https://example.com/file.iso",
      options: {
        checksum: "not-a-valid-checksum",
      },
    });
    expect(invalidChecksum.success).toBe(false);
  });

  it("validates download.refreshUrl payload with headers and options", () => {
    const valid = DownloadRefreshUrlPayloadSchema.safeParse({
      gid: "gid-123",
      newUrl: "https://example.com/refreshed-file.iso",
      filename: "refreshed-file.iso",
      directory: "/Downloads",
      headers: {
        cookie: "auth_token=abc",
        referer: "https://example.com/download-page",
        userAgent: "Mozilla/5.0",
      },
      options: {
        split: 4,
        allowOverwrite: true,
      },
    });
    expect(valid.success).toBe(true);
  });
});
