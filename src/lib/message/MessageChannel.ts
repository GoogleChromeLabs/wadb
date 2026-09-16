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

import {Transport} from '../transport';
import {Message} from './Message';
import {MessageHeader} from './MessageHeader';
import {Options} from '../Options';
import {MessageListener} from './MessageListener';

// Upper bound on the payload size accepted from the remote peer. The
// client advertises 256 KiB (see MAX_PAYLOAD in AdbClient.ts); allow up to
// 1 MiB inbound to tolerate peers negotiating the modern ADB maximum, but
// reject anything larger so an oversized frame cannot force an unbounded read.
const MAX_INBOUND_PAYLOAD = 1024 * 1024;

export class MessageChannel {
  private active = true;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
      readonly transport: Transport,
      readonly options: Options,
      readonly listener: MessageListener) {
    this.readLoop().catch(() => {});
  }

  private async readLoop(): Promise<void> {
    try {
      while (this.active) {
        const message = await this.read();
        if (this.options.debug) {
          console.log('<<<', message);
        }
        this.listener.newMessage(message);
      }
    } catch (e) {
      if (this.options.debug) {
        console.log('Error in MessageChannel readLoop:', e);
      }
      this.close();
    }
  }

  private async readHeader(): Promise<MessageHeader> {
    const response = await this.transport.read(24);
    return MessageHeader.parse(response, this.options.useChecksum);
  }

  private async read(): Promise<Message> {
    const header = await this.readHeader();
    if (header.length > MAX_INBOUND_PAYLOAD) {
      throw new Error(
          `Rejecting message: payload length ${header.length} exceeds ` +
          `MAX_INBOUND_PAYLOAD (${MAX_INBOUND_PAYLOAD})`);
    }
    let receivedData;
    switch (header.cmd) {
      default: {
        if (header.length > 0) {
          receivedData = await this.transport.read(header.length);
        }
      }
    }
    const message = new Message(header, receivedData);
    return message;
  }

  close(): void {
    this.active = false;
  }

  async write(m: Message): Promise<void> {
    if (this.options.debug) {
      console.log('>>>', m);
    }
    const headerView = m.header.toDataView();
    let payload: ArrayBuffer;

    if (m.data && m.data.byteLength > 0) {
      const combined = new Uint8Array(24 + m.data.byteLength);
      combined.set(new Uint8Array(headerView.buffer, headerView.byteOffset, headerView.byteLength), 0);
      combined.set(new Uint8Array(m.data.buffer, m.data.byteOffset, m.data.byteLength), 24);
      payload = combined.buffer as ArrayBuffer;
    } else {
      const single = new Uint8Array(headerView.byteLength);
      single.set(new Uint8Array(headerView.buffer, headerView.byteOffset, headerView.byteLength), 0);
      payload = single.buffer as ArrayBuffer;
    }

    const currentWrite = this.writeQueue
      .catch(() => {})
      .then(async () => {
        if (!this.active) return;
        await this.transport.write(payload);
      });

    this.writeQueue = currentWrite;
    return currentWrite;
  }
}
