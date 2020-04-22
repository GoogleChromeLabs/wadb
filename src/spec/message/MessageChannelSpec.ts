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

import {Transport} from "../../lib/transport";
import {Message, MessageChannel, MessageListener, MessageHeader} from "../../lib/message";
import {Options} from "../../lib/Options";

class MockTransport implements Transport {
  receivedData: DataView[] = [];

  async read(len: number): Promise<DataView> {
    return new DataView(new ArrayBuffer(len));
  }

  async write(data: ArrayBuffer): Promise<void> {
    this.receivedData.push(new DataView(data));
    return Promise.resolve();
  }
}

class MockMessageListener implements MessageListener {
  receivedMessages: Message[] = [];

  newMessage(msg: Message): void {
    this.receivedMessages.push(msg);
  }
}

describe('MessageChannel', () => {
  const options = {
    debug: false,
    dump: false,
    useChecksum: false,
    keySize: 2048,
  } as Options;

  let messageListener: MessageListener;
  let transport: MockTransport;
  let messageChannel: MessageChannel;

  beforeEach(() => {
    messageListener = new MockMessageListener();
    transport = new MockTransport();
    messageChannel = new MessageChannel(transport, options, messageListener);
  });

  describe('#write', () => {
    it('writes a message with without data', async () => {
      const message = Message.newMessage('CNXN', 1, 2, true);
      await messageChannel.write(message);
      messageChannel.close();
      expect(transport.receivedData.length).toBe(1);
      expect(MessageHeader.parse(transport.receivedData[0])).toEqual(message.header);
    });

    it('writes a message with with data', async () => {
      const data = new DataView(new TextEncoder().encode('test').buffer);
      const message = Message.newMessage('CNXN', 1, 2, true, data);
      await messageChannel.write(message);
      messageChannel.close();
      expect(transport.receivedData.length).toBe(2);
      expect(MessageHeader.parse(transport.receivedData[0])).toEqual(message.header);
      expect(transport.receivedData[1].byteLength).toBe(4);
    });
  });
});
