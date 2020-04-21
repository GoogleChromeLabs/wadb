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

export class MessageChannel {
  private active = true;

  constructor(
      readonly transport: Transport,
      readonly options: Options,
      readonly listener: MessageListener) {
    this.readLoop();
  }

  private async readLoop(): Promise<void> {
    let message: Message;
    do {
      message = await this.read();
      if (this.options.debug) {
        console.log('<<<', message);
      }
      this.listener.newMessage(message);
    } while(this.active);
  }

  private async readHeader(): Promise<MessageHeader> {
    const response = await this.transport.read(24);
    return MessageHeader.parse(response, this.options.useChecksum);
  }

  private async read(): Promise<Message> {
    const header = await this.readHeader();
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
    const data = m.header.toDataView();
    await this.transport.write(data.buffer);
    if (m.data) {
      await this.transport.write(m.data.buffer);
    }
  }
}
