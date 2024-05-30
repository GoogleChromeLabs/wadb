/*
 * Copyright 2020 Google Inc. All Rights Reserved.
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

import {AdbClient} from './AdbClient';
import {Message} from './message';
import {Options} from './Options';
import {toHex32} from './Helpers';
import {SyncFrame} from './SyncFrame';
import {AsyncBlockingQueue} from './Queues';

export class Stream {
  private static nextId = 1;
  private messageQueue = new AsyncBlockingQueue<Message>();

  constructor(readonly client: AdbClient, readonly service: string, readonly localId: number,
              readonly remoteId: number, private options: Options) {
  }

  async close(): Promise<void> {
    await this.write('CLSE');

    if (this.options.debug) {
      console.log(`Closed stream ${this.service}`);
      console.log(` local_id: 0x${toHex32(this.localId)}`);
      console.log(` remote_id: 0x${toHex32(this.remoteId)}`);
    }
    this.client.unregisterStream(this);
  }

  consumeMessage(msg: Message): boolean {
    if (msg.header.arg0 === 0 || msg.header.arg0 !== this.remoteId ||
      msg.header.arg1 === 0 || msg.header.arg1 !== this.localId) {
      return false;
    }
    this.messageQueue.enqueue(msg);
    return true;
  }

  async write(cmd: string, data?: DataView): Promise<void> {
    const message = this.newMessage(cmd, data);
    await this.client.sendMessage(message);
  }

  async read(): Promise<Message> {
    return this.messageQueue.dequeue();
  }

  /**
   * Sends a message and waits for a specific response message.
   *
   * @param {Message} m The message to send.
   * @param {string} responseCmd The expected command of the response message.
   * @throws {Error} If the response message has a different command.
   */
  async sendReceive(m: Message, responseCmd: string): Promise<void> {
    await this.client.sendMessage(m);
    const response = await this.read();
    if (response.header.cmd !== responseCmd) {
      throw new Error('WRTE/SEND failed: ' + response);
    }
  }


  /**
   *
   * Retrieves a file from device to a local file. The remote path is the path to
   * the file that will be returned. Just as for the SEND sync request the file
   * received is split up into chunks. The sync response id is "DATA" and length is
   * the chunk size. After follows chunk size number of bytes. This is repeated
   * until the file is transferred. Each chunk will not be larger than 64k.
   * When the file is transferred a sync response "DONE" is retrieved where the
   * length can be ignored.
   *
   * @param {string} remotePath path to the file to be pulled from the device
   * @returns {Promise<Blob>} a Blog with the file contents.
   */
  async pull(remotePath: string): Promise<Blob> {
    const encoder = new TextEncoder();
    const encodedFilename = encoder.encode(remotePath);

    // Sends RECV with filename length.
    const recvFrame = new SyncFrame('RECV', encodedFilename.byteLength);
    const wrteRecvMessage = this.newMessage('WRTE', recvFrame.toDataView());
    await this.client.sendMessage(wrteRecvMessage);
    const wrteRecvResponse = await this.read();
    if (wrteRecvResponse.header.cmd !== 'OKAY') {
      throw new Error('WRTE/RECV failed: ' + wrteRecvResponse);
    }

    // 17. We send the path of the file we want again sdcard/someFile.txt
    const wrteFilenameMessage = this.newMessage('WRTE', new DataView(encodedFilename.buffer));
    await this.client.sendMessage(wrteFilenameMessage);

    // 18. Device sends us OKAY
    const wrteFilenameResponse = await this.read();
    if (wrteFilenameResponse.header.cmd !== 'OKAY') {
      throw new Error('WRTE/filename failed: ' + wrteFilenameResponse);
    }

    const okayMessage = this.newMessage('OKAY');
    let fileDataMessage = await this.read();
    await this.client.sendMessage(okayMessage);

    let syncFrame = SyncFrame.fromDataView(new DataView(fileDataMessage.data!.buffer.slice(0, 8)));
    let buffer = new Uint8Array(fileDataMessage.data!.buffer.slice(8));
    const chunks: ArrayBuffer[] = [];
    while (syncFrame.cmd !== 'DONE') {
      while (syncFrame.byteLength >= buffer.byteLength) {
        fileDataMessage = await this.read();
        await this.client.sendMessage(okayMessage);

        // Join both arrays
        const newLength = buffer.byteLength + fileDataMessage.data!.byteLength;
        const newBuffer = new Uint8Array(newLength);
        newBuffer.set(buffer, 0);
        newBuffer.set(new Uint8Array(fileDataMessage.data!.buffer), buffer.byteLength);
        buffer = newBuffer;
      }
      chunks.push(buffer.slice(0, syncFrame.byteLength).buffer);
      buffer = buffer.slice(syncFrame.byteLength);
      syncFrame = SyncFrame.fromDataView(new DataView(buffer.slice(0, 8).buffer));
      buffer = buffer.slice(8);
    }
    return new Blob(chunks);
  }


  /**
   * Pushes a blob of data to the device at the specified remote path.
   *
   * @param {Blob} blob The data to push.
   * @param {string} remotePath The path on the device to write the data to.
   * @param {string} mode The mode to set on the file.
   * @param {number} chunkSize The size of data chunks to send at a time.
   */
  async push(blob: Blob, remotePath: string, mode: string, chunkSize: number):
    Promise<void> {
    const reader = new FileReader();
    const encoder = new TextEncoder();

    // Encodes the remote path for sending over ADB.
    const encodedFilename = encoder.encode(remotePath);

    // --- Negotiation Phase ---
    // 1. Sends SEND command with total filename+mode length.
    const sendFrame =
      new SyncFrame('SEND', remotePath.length + 1 + mode.length);
    const wrteSendMessage = this.newMessage('WRTE', sendFrame.toDataView());
    await this.sendReceive(wrteSendMessage, 'OKAY');

    // 2. Sends the filename.
    const wrteFilenameMessage =
      this.newMessage('WRTE', new DataView(encodedFilename.buffer));
    await this.sendReceive(wrteFilenameMessage, 'OKAY');

    // 3. Sends the mode.
    const wrteModeMessage = this.newMessage(
      'WRTE', new DataView(encoder.encode(',' + mode).buffer));
    await this.sendReceive(wrteModeMessage, 'OKAY');

    // --- Data Transfer Phase ---
    // 1. Reads the Blob as an ArrayBuffer.
    const arrayBufferPromise = new Promise<ArrayBuffer>((resolve, reject) => {
      reader.onload = (event) => {
        return resolve(event.target!.result as ArrayBuffer);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const buffer: ArrayBuffer = await arrayBufferPromise;

    // 2. Splits the buffer into chunks.
    const chunks: ArrayBufferLike[] = [];
    for (let i = 0; i < buffer.byteLength; i += chunkSize) {
      chunks.push(buffer.slice(i, Math.min(i + chunkSize, buffer.byteLength)));
    }

    // 3. Sends each chunk with its size.
    for (const chunk of chunks) {
      const syncFrame = new SyncFrame('DATA', chunk.byteLength);
      const wrteByteLengthMessage =
        this.newMessage('WRTE', syncFrame.toDataView());
      await this.sendReceive(wrteByteLengthMessage, 'OKAY');

      const dataView = new DataView(chunk);
      const wrteChunkMessage = this.newMessage('WRTE', dataView);
      await this.sendReceive(wrteChunkMessage, 'OKAY');
    }

    // --- Finishing Up ---
    // 1. Sends DONE frame with current timestamp.
    const doneFrame = new SyncFrame('DONE', Math.round(Date.now() / 1000));
    const doneMessage = this.newMessage('WRTE', doneFrame.toDataView());
    await this.client.sendMessage(doneMessage);

    // 2. Reads response (should be OKAY) and send final OKAY.
    const okayMessage = this.newMessage('OKAY');
    await this.sendReceive(okayMessage, 'OKAY');
  }


  private newMessage(cmd: string, data?: DataView): Message {
    return Message.newMessage(
      cmd, this.localId, this.remoteId, this.options.useChecksum, data);
  }

  static async open(adbClient: AdbClient, service: string, options: Options): Promise<Stream> {
    const localId = Stream.nextId++;
    let remoteId = 0;
    const m = Message.open(localId, remoteId, service, options.useChecksum);
    await adbClient.sendMessage(m);

    let response;
    do {
      response = await adbClient.awaitMessage();
    } while (response.header.arg1 !== localId);

    if (response.header.cmd !== 'OKAY') {
      throw new Error('OPEN Failed');
    }

    remoteId = response.header.arg0;
    if (options.debug) {
      console.log(`Opened stream ${service}`);
      console.log(` local_id: 0x${toHex32(localId)}`);
      console.log(` remote_id: 0x${toHex32(remoteId)}`);
    }

    const stream = new Stream(adbClient, service, localId, remoteId, options);
    adbClient.registerStream(stream);
    return stream;
  }
}
