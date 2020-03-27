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

import Stream from './Stream';

type callbackFunction = (text: string) => void;

export default class Shell {
  private textDecoder = new TextDecoder();
  private textEncoder = new TextEncoder();
  private readClosed: Promise<void>;
  private okayReceived?: Promise<void>;

  constructor(readonly stream: Stream, readonly calbackFunction?: callbackFunction) {
    this.readClosed = this.loopRead();
  }

  private async loopRead() {
    let message;
    do {
      message = await this.stream.read();
      if (message.header.cmd === 'OKAY') {
        console.log('OKAY');
      }

      if (message.header.cmd === 'WRTE') {
        this.stream.write('OKAY');
        const data = this.textDecoder.decode(message.data!);
        if (this.calbackFunction) {
          this.calbackFunction(data);
        }
      }
    } while (message.header.cmd !== 'CLSE')
  }

  async write(command: string) {
    const data = this.textEncoder.encode(command);
    await this.stream.write('WRTE', new DataView(data.buffer));
    // this.okayReceived = new Promise((resolve, reject) => {

    // });
    // await this.okayReceived;    

  }

  async close() {
    await this.stream.close();
    await this.readClosed;
  }
}
