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

import AdbClient from './AdbClient';
import {Message, MessageHeader} from './Message';
import {Options} from './Options';
import {toHex32} from './Helpers';
import SyncFrame from './SyncFrame';

export default class Stream {
  private static nextId: number = 1;
  private isOpen: boolean;

  constructor(private client: AdbClient, private service: string, private localId: number,
     private remoteId: number, private options: Options) {
    this.isOpen = true;
  }

  async close(): Promise<void> {
    if (!this.isOpen) {
      return;
    }

    const closeMessage = this.newMessage('CLSE');
    await this.client.sendMessage(closeMessage);

		if (this.options.debug) {
			console.log(`Closed stream ${this.service}`);
			console.log(` local_id: 0x${toHex32(this.localId)}`);
			console.log(` remote_id: 0x${toHex32(this.remoteId)}`);
		}
  }

  async readHeader(): Promise<MessageHeader> {
    const header = await this.client.receiveMessageHeader();
    // remote's prospective of local_id/remote_id is reversed
    if (header.arg0 !== 0 && header.arg0 !== this.remoteId) {
      throw new Error(
        `Incorrect arg0: 0x${toHex32(header.arg0)} (expected 0x${toHex32(this.remoteId)})`
      );
    }
    if (this.localId !== 0 && header.arg1 !== this.localId) {
      throw new Error(
        `Incorrect arg1: 0x${toHex32(header.arg1)} (expected 0x${toHex32(this.localId)})`
      );
    }
    return header;
  }

  async write(cmd: string, data?: DataView) {
    const message = this.newMessage(cmd, data);
    await this.client.sendMessage(message);
  }

  async read(): Promise<Message> {
    const response = await this.client.receiveMessage();

    // remote's prospective of local_id/remote_id is reversed
    if (response.header.arg0 !== 0 && response.header.arg0 !== this.remoteId) {
      throw new Error(
        `Incorrect arg0: 0x${toHex32(response.header.arg0)} (expected 0x${toHex32(this.remoteId)})`
      );
    }
    if (this.localId !== 0 && response.header.arg1 !== this.localId) {
      throw new Error(
        `Incorrect arg1: 0x${toHex32(response.header.arg1)} (expected 0x${toHex32(this.localId)})`
      );
    }
    return response;
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
   */
  async pull(filename: string): Promise<Blob> {
    const encoder = new TextEncoder();
    const encodedFilename = encoder.encode(filename);

    // Sends RECV with filename length.
    const recvFrame = new SyncFrame('RECV', encodedFilename.byteLength);
    const wrteRecvMessage = this.newMessage('WRTE', recvFrame.toDataView());
    console.log('>>>', wrteRecvMessage);
    await this.client.sendMessage(wrteRecvMessage);
    const wrteRecvResponse = await this.read();
    console.log('<<<', wrteRecvResponse);
    if (wrteRecvResponse.header.cmd !== 'OKAY') {
      throw new Error('WRTE/RECV failed: ' + wrteRecvResponse);
    }

    // 17. We send the path of the file we want again sdcard/someFile.txt
    const wrteFilenameMessage = this.newMessage('WRTE', new DataView(encodedFilename.buffer));
    console.log('>>>', wrteFilenameMessage);
    await this.client.sendMessage(wrteFilenameMessage);

    // 18. Device sends us OKAY
    const wrteFilenameResponse = await this.read();
    console.log('<<<', wrteFilenameResponse);
    if (wrteFilenameResponse.header.cmd !== 'OKAY') {
      throw new Error('WRTE/filename failed: ' + wrteFilenameResponse);
    }

    const okayMessage = this.newMessage('OKAY');

    console.log('expect WRTE');
    let fileDataMessage = await this.read();
    console.log('<<<', fileDataMessage);

    console.log('>>>', okayMessage);
    await this.client.sendMessage(okayMessage);

    let syncFrame = SyncFrame.fromDataView(new DataView(fileDataMessage.data!.buffer.slice(0, 8)));
    let buffer = new Uint8Array(fileDataMessage.data!.buffer.slice(8));
    const chunks: ArrayBuffer[] = [];
    while (syncFrame.cmd !== 'DONE') {
      console.log(syncFrame);
      while (syncFrame.byteLength >= buffer.byteLength) {
        fileDataMessage = await this.read();
        console.log('<<<', fileDataMessage);
        console.log('>>>', okayMessage);
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

  private newMessage(cmd: string, data?: DataView): Message {
    return Message.newMessage(
      cmd, this.localId, this.remoteId, this.options.useChecksum, data);
  }

  static async open(device: AdbClient, service: string, options: Options): Promise<Stream> {
    const localId = Stream.nextId++;
    let remoteId = 0;
    const m = Message.open(localId, remoteId, service, options.useChecksum);
    console.log('open message:', m);

    await device.sendMessage(m);

    let response;
    do {
      console.log('awaiting for response');
      response = await device.receiveMessage();
      console.log('Reeived response: ', response);
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

    return new Stream(device, service, localId, remoteId, options);
  }
}
