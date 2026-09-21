import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";

export const MAX_MESSAGE_SIZE = 1024 * 1024; // 1 MB limit

export interface NativeMessageCodecEvents {
  message: [message: unknown];
  error: [error: Error];
}

export class NativeMessageReader extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);

  constructor(private input: Readable) {
    super();
    this.input.on("data", this.handleData.bind(this));
    this.input.on("error", (err) => this.emit("error", err));
    this.input.on("end", () => this.emit("end"));
    this.input.on("close", () => this.emit("close"));
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 4) {
      const messageLength = this.buffer.readUInt32LE(0);

      if (messageLength > MAX_MESSAGE_SIZE) {
        this.emit(
          "error",
          new Error(
            `Message length ${messageLength} exceeds maximum allowed size of ${MAX_MESSAGE_SIZE} bytes`
          )
        );
        // Discard buffer to prevent poison pill
        this.buffer = Buffer.alloc(0);
        return;
      }

      if (this.buffer.length < 4 + messageLength) {
        // Wait for more data
        break;
      }

      const rawPayload = this.buffer.subarray(4, 4 + messageLength);
      this.buffer = this.buffer.subarray(4 + messageLength);

      try {
        const text = rawPayload.toString("utf8");
        const json = JSON.parse(text);
        this.emit("message", json);
      } catch (parseError) {
        this.emit(
          "error",
          new Error(`Failed to parse native message JSON: ${(parseError as Error).message}`)
        );
      }
    }
  }
}

export class NativeMessageWriter {
  constructor(private output: Writable) {}

  public write(message: unknown): boolean {
    const jsonStr = JSON.stringify(message);
    const payloadBuffer = Buffer.from(jsonStr, "utf8");

    if (payloadBuffer.length > MAX_MESSAGE_SIZE) {
      throw new Error(
        `Payload size ${payloadBuffer.length} exceeds maximum allowed size of ${MAX_MESSAGE_SIZE} bytes`
      );
    }

    const header = Buffer.alloc(4);
    header.writeUInt32LE(payloadBuffer.length, 0);

    const frame = Buffer.concat([header, payloadBuffer]);
    return this.output.write(frame);
  }
}
