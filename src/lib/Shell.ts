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

import {Stream} from './Stream';
import {Message} from './message';

type callbackFunction = (text: string) => void;

export class Shell {
  private textDecoder = new TextDecoder();
  private textEncoder = new TextEncoder();
  private messageListener: ((message: Message) => void)[] = [];
  private closed = false;

  constructor(readonly stream: Stream, readonly callbackFunction?: callbackFunction) {
    this.loopRead();
  }

  private async loopRead(): Promise<void> {
    try {
      let message;
      do {
        message = await this.stream.read();

        if (message.header.cmd === 'WRTE') {
          this.stream.write('OKAY');
          const data = this.textDecoder.decode(message.data!);
          if (this.callbackFunction) {
            this.callbackFunction(data);
          }
        }

        // Resolve Messages waiting for this event
        for (const listener of this.messageListener) {
          listener(message);
        }

      } while (!this.closed)
    } catch(e) {
      console.error('loopRead crashed', e);
    }
    this.stream.client.unregisterStream(this.stream);
  }

  private waitForMessage(cmd: string): Promise<Message> {
    return new Promise<Message>(resolve => {
      const callback = (message: Message): void => {
        if (message.header.cmd === cmd) {
          const pos = this.messageListener.indexOf(callback);
          this.messageListener.splice(pos, 1);
          resolve(message);
        }
      };
      this.messageListener.push(callback);
    });
  }

  async write(command: string): Promise<void> {
    const data = this.textEncoder.encode(command);
    await this.stream.write('WRTE', new DataView(data.buffer));
    await this.waitForMessage('OKAY');
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.write('CLSE');
  }
}
