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

import {MockTransport} from '../mock/MockTransport';
import {MockMessageListener} from '../mock/MockMessageListener';
import {Message, MessageChannel, MessageHeader} from '../../lib/message';
import {Options} from '../../lib/Options';
import {Transport} from '../../lib/transport';

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
      expect(transport.receivedData.length).toBe(1);
      expect(MessageHeader.parse(transport.receivedData[0])).toEqual(message.header);
      expect(transport.receivedData[0].byteLength).toBe(28);
      const payloadBytes = new Uint8Array(transport.receivedData[0].buffer, 24, 4);
      expect(payloadBytes).toEqual(new Uint8Array(data.buffer));
    });

    it('serializes concurrent writes sequentially without overlapping transport.write calls', async () => {
      let concurrentWrites = 0;
      let maxConcurrentWrites = 0;

      const originalWrite = transport.write.bind(transport);
      spyOn(transport, 'write').and.callFake(async (payload: ArrayBuffer) => {
        concurrentWrites++;
        maxConcurrentWrites = Math.max(maxConcurrentWrites, concurrentWrites);
        // Small delay to simulate async I/O
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrentWrites--;
        return originalWrite(payload);
      });

      const msg1 = Message.newMessage('OKAY', 1, 2, false);
      const msg2 = Message.newMessage('WRTE', 1, 2, false);
      const msg3 = Message.newMessage('CLSE', 1, 2, false);

      await Promise.all([
        messageChannel.write(msg1),
        messageChannel.write(msg2),
        messageChannel.write(msg3),
      ]);

      expect(maxConcurrentWrites).toBe(1);
      expect(transport.receivedData.length).toBe(3);
    });

    it('does not write to transport after close()', async () => {
      messageChannel.close();
      const message = Message.newMessage('CNXN', 1, 2, true);
      await messageChannel.write(message);
      expect(transport.receivedData.length).toBe(0);
    });
  });

  describe('#readLoop', () => {
    const messageWithoutData = Message.newMessage('MOCK', 0, 0, true);
    const data = new DataView(new TextEncoder().encode('test').buffer);
    const messageWithData = Message.newMessage('MOCK', 0, 0, true, data);

    beforeEach(() => {
      messageListener = new MockMessageListener();
      transport = new MockTransport();
    });

    it('Receives a Message', async () => {
      transport.pushData(messageWithoutData.header.toDataView());
      messageChannel = new MessageChannel(transport, options, messageListener);
      const receivedMessage = await messageListener.messageQueue.dequeue();
      expect(receivedMessage.header).toEqual(messageWithoutData.header);
    });

    it('Receives a Message with data', async () => {
      transport.pushData(messageWithData.header.toDataView());
      transport.pushData(messageWithData.data!);
      messageChannel = new MessageChannel(transport, options, messageListener);
      const receivedMessage = await messageListener.messageQueue.dequeue();
      expect(receivedMessage).toEqual(messageWithData);
    });

    it('Receives Messages in the right order', async () => {
      transport.pushData(messageWithoutData.header.toDataView());
      transport.pushData(messageWithData.header.toDataView());
      transport.pushData(messageWithData.data!);
      messageChannel = new MessageChannel(transport, options, messageListener);
      const receivedMessage1 = await messageListener.messageQueue.dequeue();
      const receivedMessage2 = await messageListener.messageQueue.dequeue();
      expect(receivedMessage1).toEqual(messageWithoutData);
      expect(receivedMessage2).toEqual(messageWithData);
    });

    it('does not request payload from transport when message header length exceeds maximum allowed size', async () => {
      // Simulate receiving a message header with an oversized payload length (e.g. 0xFFFFFFFF)
      const oversizedLength = 0xFFFFFFFF;
      const header = new MessageHeader('OKAY', 0, 0, oversizedLength, 0);
      transport.pushData(header.toDataView());
      const readSpy = spyOn(transport, 'read').and.callThrough();

      messageChannel = new MessageChannel(transport, options, messageListener);

      // Allow readLoop microtasks time to process the header
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Transport should not be requested to read an oversized payload
      expect(readSpy).not.toHaveBeenCalledWith(oversizedLength);
    });

    it('rejects when reading a message with payload length exceeding maximum allowed size', async () => {
      const oversizedLength = 0xFFFFFFFF;
      const header = new MessageHeader('OKAY', 0, 0, oversizedLength, 0);
      const testTransport: Transport = {
        read: jasmine.createSpy('read').and.callFake(async (len: number) => {
          if (len === 24) {
            return header.toDataView();
          }
          return new DataView(new ArrayBuffer(0));
        }),
        write: jasmine.createSpy('write').and.resolveTo(),
      };

      const channel = Object.create(MessageChannel.prototype);
      channel.transport = testTransport;
      channel.options = options;

      await expectAsync(channel.read()).toBeRejectedWithError(/exceeds/i);
    });
  });
});
