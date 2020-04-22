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
import {AsyncBlockingQueue} from "../../lib/Queues";

class MockTransport implements Transport {
  receivedData: DataView[] = [];
  pendingData: ArrayBuffer = new ArrayBuffer(0);
  pos = 0;
  reject?: (reason: Error) => void;

  pushData(buffer: ArrayBuffer): void {
    const tmp = new Uint8Array(this.pendingData.byteLength + buffer.byteLength);
    tmp.set(new Uint8Array(this.pendingData), 0);
    tmp.set(new Uint8Array(buffer), this.pendingData.byteLength);
    this.pendingData = tmp.buffer;
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

class MockMessageListener implements MessageListener {
  messageQueue = new AsyncBlockingQueue<Message>(); 

  newMessage(msg: Message): void {
    this.messageQueue.enqueue(msg);
  }
}

describe('MessageChannel', () => {
  const options = {
    debug: false,
    dump: false,
    useChecksum: false,
    keySize: 2048,
  } as Options;

  let messageListener: MockMessageListener;
  let transport: MockTransport;
  let messageChannel: MessageChannel;

  describe('#write', () => {
    beforeEach(() => {
      messageListener = new MockMessageListener();
      transport = new MockTransport();
      messageChannel = new MessageChannel(transport, options, messageListener);
    });

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

  describe('#readLoop', () => {
    beforeEach(() => {
      messageListener = new MockMessageListener();
      transport = new MockTransport();
    });

    it('Reads a Message', async () => {
      const msg = Message.newMessage('MOCK', 0, 0, true);
      transport.pushData(msg.header.toDataView().buffer);
      messageChannel = new MessageChannel(transport, options, messageListener);
      const receivedMessage = await messageListener.messageQueue.dequeue();
      expect(receivedMessage.header).toEqual(msg.header);
    });
  });
});
