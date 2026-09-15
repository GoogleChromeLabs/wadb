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

import {AdbClient} from '../lib/AdbClient';
import {MockTransport} from './mock/MockTransport';
import {MockKeyStore} from './mock/MockKeyStore';
import {Options} from '../lib/Options';
import {Message} from '../lib/message';

describe('AdbClient', () => {
  const keyStore = new MockKeyStore();
  const options = {
    debug: false,
    dump: false,
    useChecksum: false,
    keySize: 2048,
  } as Options;

  describe('#connect', () => {

    let transport: MockTransport;

    beforeEach(() => {
      transport = new MockTransport();
    });

    it('Server doesn\'t request AUTH and responds with CNXN', async () => {
      await transport.pushFromFile('src/spec/data/messages/connect/connect_simple.json');
      const adbClient = new AdbClient(transport, options, keyStore);
      const adbDeviceInfo = await adbClient.connect();
      expect(adbDeviceInfo).toBeDefined();
    });

    it('Server responds with AUTH and then CNXN', async () => {
      await transport.pushFromFile('src/spec/data/messages/connect/connect_auth_public_key.json');
      const adbClient = new AdbClient(transport, options, keyStore);
      const adbDeviceInfo = await adbClient.connect();
      expect(adbDeviceInfo).toBeDefined();
    });
  });

  describe('#newMessage', () => {
    it('Caps unmatched messages to MAX_PENDING_MESSAGES to prevent unbounded retention', () => {
      const transport = new MockTransport();
      const adbClient = new AdbClient(transport, options, keyStore);
      const msg = Message.newMessage('OKAY', 0, 0, false);
      for (let i = 0; i < 300; i++) {
        adbClient.newMessage(msg);
      }
      expect((adbClient as unknown as {messageQueue: {size: number}}).messageQueue.size).toBe(256);
    });

    it('Caps retention when a rogue device streams unmatched frames over the transport while idle', async () => {
      const transport = new MockTransport();
      const okayMsg = Message.newMessage('OKAY', 0, 0, false);

      // Simulate rogue device streaming 1000 unmatched 24-byte OKAY headers over the transport
      for (let i = 0; i < 1000; i++) {
        transport.pushMessage(okayMsg);
      }

      // Constructing AdbClient starts MessageChannel.readLoop() immediately
      const adbClient = new AdbClient(transport, options, keyStore);

      // Allow readLoop() microtasks to process all pending transport data
      while (transport.pendingData.byteLength - transport.pos >= 24) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      // Verify that out of 1000 streamed transport frames, only 256 are retained
      const queue = (adbClient as unknown as {messageQueue: {size: number}}).messageQueue;
      expect(queue.size).toBe(256);
    });
  });
});
