import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { NativeMessageReader, NativeMessageWriter } from "./codec.js";

describe("Native Messaging Framing Codec", () => {
  it("encodes and decodes message through streams", async () => {
    const stream = new PassThrough();
    const reader = new NativeMessageReader(stream);
    const writer = new NativeMessageWriter(stream);

    const received: unknown[] = [];
    reader.on("message", (msg) => received.push(msg));

    const testMsg = { protocolVersion: 1, type: "ping", payload: {} };
    writer.write(testMsg);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received.length).toBe(1);
    expect(received[0]).toEqual(testMsg);
  });

  it("handles fragmented stream chunks correctly", async () => {
    const stream = new PassThrough();
    const reader = new NativeMessageReader(stream);

    const received: unknown[] = [];
    reader.on("message", (msg) => received.push(msg));

    const payload = JSON.stringify({ hello: "world" });
    const payloadBuffer = Buffer.from(payload, "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payloadBuffer.length, 0);
    const full = Buffer.concat([header, payloadBuffer]);

    // Send in two byte chunks
    stream.write(full.subarray(0, 2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received.length).toBe(0);

    stream.write(full.subarray(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received.length).toBe(1);
    expect(received[0]).toEqual({ hello: "world" });
  });
});
