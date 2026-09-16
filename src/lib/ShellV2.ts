/*
 * Copyright 2026 Google Inc. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import {Stream} from './Stream';
import {Message} from './message';

// ADB Shell v2 protocol packet types
export const SHELL_V2_STDIN = 0;
export const SHELL_V2_STDOUT = 1;
export const SHELL_V2_STDERR = 2;
export const SHELL_V2_EXIT = 3;
export const SHELL_V2_CLOSE_STDIN = 4;
export const SHELL_V2_WINDOW_SIZE_CHANGE = 5;

// Header size for Shell v2 packets: 1 byte ID + 4 bytes length (little-endian)
const HEADER_SIZE = 5;

// Cap inbound packet size to prevent unbounded memory allocation
const MAX_PACKET_LENGTH = 1024 * 1024; // 1 MiB

export class ShellV2 {
  readonly stdout: ReadableStream<Uint8Array>;
  private stdoutController!: ReadableStreamDefaultController<Uint8Array>;
  private stdoutCancelled = false;

  readonly stderr: ReadableStream<Uint8Array>;
  private stderrController!: ReadableStreamDefaultController<Uint8Array>;
  private stderrCancelled = false;

  readonly exitCode: Promise<number>;
  private exitCodeResolve!: (code: number) => void;
  private exitCodeReject!: (err: unknown) => void;
  private exitCodeResolved = false;

  private closed = false;
  private messageListeners: ((message: Message) => void)[] = [];
  private processStreamPromise: Promise<void>;

  constructor(readonly stream: Stream) {
    this.stdout = new ReadableStream<Uint8Array>({
      start: (controller): void => {
        this.stdoutController = controller;
      },
      cancel: (): void => {
        this.stdoutCancelled = true;
        this.checkCancellation();
      },
    });

    this.stderr = new ReadableStream<Uint8Array>({
      start: (controller): void => {
        this.stderrController = controller;
      },
      cancel: (): void => {
        this.stderrCancelled = true;
        this.checkCancellation();
      },
    });

    this.exitCode = new Promise<number>((resolve, reject) => {
      this.exitCodeResolve = resolve;
      this.exitCodeReject = reject;
    });

    this.processStreamPromise = this.processStream();
    this.processStreamPromise.catch(() => {
      // Prevent unhandled promise rejection in the background processor;
      // errors are propagated via stdout, stderr, and exitCode.
    });
  }

  private checkCancellation(): void {
    if (this.stdoutCancelled && this.stderrCancelled && !this.closed) {
      this.close().catch(() => {});
    }
  }

  private resolveExitCode(code: number): void {
    if (!this.exitCodeResolved) {
      this.exitCodeResolved = true;
      this.exitCodeResolve(code);
    }
  }

  private rejectExitCode(err: unknown): void {
    if (!this.exitCodeResolved) {
      this.exitCodeResolved = true;
      this.exitCodeReject(err);
    }
  }

  private waitForMessage(cmd: string): Promise<Message> {
    return new Promise<Message>((resolve) => {
      const listener = (message: Message): void => {
        if (message.header.cmd === cmd) {
          const index = this.messageListeners.indexOf(listener);
          if (index !== -1) {
            this.messageListeners.splice(index, 1);
          }
          resolve(message);
        }
      };
      this.messageListeners.push(listener);
    });
  }

  private async processStream(): Promise<void> {
    let buffer = new Uint8Array(0);

    try {
      while (!this.closed) {
        const message = await this.stream.read();

        // Resolve listeners waiting for this message
        for (const listener of [...this.messageListeners]) {
          listener(message);
        }

        if (message.header.cmd === 'CLSE') {
          break;
        }

        if (message.header.cmd === 'WRTE') {
          await this.stream.write('OKAY');

          if (message.data && message.data.byteLength > 0) {
            const incoming = new Uint8Array(
                message.data.buffer,
                message.data.byteOffset,
                message.data.byteLength
            );

            if (buffer.length === 0) {
              buffer = new Uint8Array(incoming);
            } else {
              const combined = new Uint8Array(buffer.length + incoming.length);
              combined.set(buffer, 0);
              combined.set(incoming, buffer.length);
              buffer = combined;
            }

            while (buffer.length >= HEADER_SIZE) {
              const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
              const packetType = view.getUint8(0);
              const packetLength = view.getUint32(1, true);

              if (packetLength > MAX_PACKET_LENGTH) {
                throw new Error(
                    `Shell v2 packet length ${packetLength} exceeds maximum allowed (${MAX_PACKET_LENGTH})`);
              }

              if (buffer.length < HEADER_SIZE + packetLength) {
                break;
              }

              const packetData = buffer.slice(HEADER_SIZE, HEADER_SIZE + packetLength);
              buffer = buffer.slice(HEADER_SIZE + packetLength);

              this.handlePacket(packetType, packetData);
            }
          }
        }
      }

      if (!this.exitCodeResolved) {
        this.resolveExitCode(-1);
      }
    } catch (err) {
      this.rejectExitCode(err);
      try {
        this.stdoutController.error(err);
      } catch {
        // Controller may already be closed or errored
      }
      try {
        this.stderrController.error(err);
      } catch {
        // Controller may already be closed or errored
      }
      throw err;
    } finally {
      this.closed = true;
      try {
        this.stdoutController.close();
      } catch {
        // Ignore if already closed or errored
      }
      try {
        this.stderrController.close();
      } catch {
        // Ignore if already closed or errored
      }
      await this.stream.close().catch(() => {});
    }
  }

  private handlePacket(cmd: number, data: Uint8Array): void {
    switch (cmd) {
      case SHELL_V2_STDOUT:
        if (!this.stdoutCancelled) {
          try {
            this.stdoutController.enqueue(data);
          } catch {
            // Ignore enqueue error if stream was already closed
          }
        }
        break;
      case SHELL_V2_STDERR:
        if (!this.stderrCancelled) {
          try {
            this.stderrController.enqueue(data);
          } catch {
            // Ignore enqueue error if stream was already closed
          }
        }
        break;
      case SHELL_V2_EXIT:
        if (data.length > 0) {
          this.resolveExitCode(data[0]);
        } else {
          this.resolveExitCode(0);
        }
        break;
      default:
        // Ignore unhandled packet types (e.g., echo of stdin, window size change)
        break;
    }
  }

  /**
   * Writes data to stdin of the running shell process.
   *
   * @param {Uint8Array | string} data data to send to stdin
   */
  async writeStdin(data: Uint8Array | string): Promise<void> {
    const payload = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const packet = new Uint8Array(HEADER_SIZE + payload.length);
    const view = new DataView(packet.buffer);
    view.setUint8(0, SHELL_V2_STDIN);
    view.setUint32(1, payload.length, true);
    packet.set(payload, HEADER_SIZE);

    const waitPromise = this.waitForMessage('OKAY');
    await this.stream.write('WRTE', new DataView(packet.buffer));
    const response = await waitPromise;
    if (response.header.cmd !== 'OKAY') {
      throw new Error(`WRTE to stdin failed: ${response.header.cmd}`);
    }
  }

  /**
   * Closes stdin for the running shell process.
   */
  async closeStdin(): Promise<void> {
    const packet = new Uint8Array(HEADER_SIZE);
    const view = new DataView(packet.buffer);
    view.setUint8(0, SHELL_V2_CLOSE_STDIN);
    view.setUint32(1, 0, true);

    const waitPromise = this.waitForMessage('OKAY');
    await this.stream.write('WRTE', new DataView(packet.buffer));
    const response = await waitPromise;
    if (response.header.cmd !== 'OKAY') {
      throw new Error(`WRTE closeStdin failed: ${response.header.cmd}`);
    }
  }

  /**
   * Closes the shell session and underlying stream.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.stream.close();
  }
}
