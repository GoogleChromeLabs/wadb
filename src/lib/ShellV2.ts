/*
 * Copyright 2025 pajowu. All Rights Reserved.
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

import { Stream } from './Stream';

type ShellV2Packet = { cmd: number; length: number; data: ArrayBuffer };

export class ShellV2 {
    private textDecoder = new TextDecoder();

    public stdout: ReadableStream;
    private stdoutController!: ReadableStreamDefaultController;
    public stderr: ReadableStream;
    private stderrController!: ReadableStreamDefaultController;
    public exitCode: Promise<number>;
    private exitCodeResolve!: (value: number) => void;


    constructor(
        readonly stream: Stream,
    ) {
        this.stdout = new ReadableStream({
            start: (controller): void => { this.stdoutController = controller }
        });
        this.stderr = new ReadableStream({
            start: (controller): void => { this.stderrController = controller }
        });
        this.exitCode = new Promise((resolve) => this.exitCodeResolve = resolve);

        this.processStream();
    }


    private parsePackages(buffer: Uint8Array): [ShellV2Packet[], Uint8Array] {
        // parse current buffer content
        let data = new DataView(buffer.buffer);
        const packets: ShellV2Packet[] = [];
        while (data.buffer.byteLength >= 5) { // 5 bytes header
            const packetType = data.getUint8(0);
            const packetLength = data.getUint32(1, true);
            if (data.buffer.byteLength < packetLength + 5) {
                break
            }
            const packetData = data.buffer.slice(5, packetLength + 5);
            data = new DataView(data.buffer.slice(packetLength + 5));
            packets.push({ cmd: packetType, length: packetLength, data: packetData });
        }
        buffer = new Uint8Array(data.buffer);
        return [packets, buffer];
    }

    private async processStream(): Promise<void> {
        let buffer = new Uint8Array();
        let packets;
        while (true) {
            const cmd = await this.stream.read();
            if (cmd.header.cmd == 'CLSE') {
                break;
            }
            await this.stream.write('OKAY');

            // add packet content to buffer
            const newLength = buffer.length + cmd.data!.byteLength;
            const newBuffer = new Uint8Array(newLength);
            newBuffer.set(buffer, 0);
            newBuffer.set(new Uint8Array(cmd.data!.buffer), buffer.length);
            buffer = newBuffer;

            [packets, buffer] = this.parsePackages(buffer);
            for (const pkt of packets) {
                switch (pkt.cmd) {
                    case 0:
                        break;
                    case 1:
                        this.stdoutController.enqueue(new Uint8Array(pkt.data));
                        break;
                    case 2:
                        this.stderrController.enqueue(new Uint8Array(pkt.data));
                        break;
                    case 3:
                        this.exitCodeResolve(new Uint8Array(pkt.data)[0]);
                        break;
                    default:
                        console.warn('unknown cmd', pkt);
                }
            }
        }

        await this.stream.close();
        await this.stdoutController.close();
        await this.stderrController.close();
    }
}
