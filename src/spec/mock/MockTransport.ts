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

import {Transport} from '../../lib/transport';
import {Message} from '../../lib/message';
import * as fs from 'fs';

export class MockTransport implements Transport {
  receivedData: DataView[] = [];
  pendingData: ArrayBuffer = new ArrayBuffer(0);
  pos = 0;
  reject?: (reason: Error) => void;

  async pushFromFile(fileName: string): Promise<void> {
    const textEncoder = new TextEncoder();
    const messages = JSON.parse(await fs.promises.readFile(fileName, {encoding: "utf-8"}));
    for (const jsonMessage of messages) {
      const cmd = jsonMessage.cmd;
      const arg0 = jsonMessage.arg0;
      const arg1 = jsonMessage.arg1;
      const data = jsonMessage.data ?
          new DataView(textEncoder.encode(jsonMessage.data).buffer) : jsonMessage.data;
      const useChecksum = !!data.useChecksum;    
      this.pushMessage(Message.newMessage(cmd, arg0, arg1, useChecksum, data));
    }
  }

  pushData(data: DataView): void {
    const buffer = data.buffer;
    const tmp = new Uint8Array(this.pendingData.byteLength + buffer.byteLength);
    tmp.set(new Uint8Array(this.pendingData), 0);
    tmp.set(new Uint8Array(buffer), this.pendingData.byteLength);
    this.pendingData = tmp.buffer;
  }

  pushMessage(msg: Message): void {
    this.pushData(msg.header.toDataView());
    if (msg.data) {
      this.pushData(msg.data);
    }
  }

  async read(len: number): Promise<DataView> {
    // Our buffer doesn't have enough data.
    if (this.pendingData.byteLength - this.pos < len) {
      return new Promise((_, reject) => {
        this.reject = reject;
      });
    }

    const dataView = new DataView(this.pendingData, this.pos, len);
    this.pos += len;
    return dataView;
  }

  async write(data: ArrayBuffer): Promise<void> {
    this.receivedData.push(new DataView(data));
    return Promise.resolve();
  }

  close(): void {
    if (this.reject) {
      this.reject(new Error('Transport Closed'));
    }
  }
}
