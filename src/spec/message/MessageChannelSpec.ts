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
  });
});
