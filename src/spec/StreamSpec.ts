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
import {MockKeyStore} from './mock/MockKeyStore';
import {Options} from '../lib/Options';
import {MockTransport} from './mock/MockTransport';
import {Stream} from '../lib/Stream';
import {Message} from '../lib/message';

const options = {
  debug: false,
  dump: false,
  useChecksum: false,
  keySize: 2048,
} as Options;

describe('Stream', () => {
  describe('#open', () => {
    beforeEach(() => {
      (Stream as unknown as {nextId: number}).nextId = 1;
    });

    it('Opens a stream', async () => {
      const mockTransport = new MockTransport();
      await mockTransport.pushFromFile('src/spec/data/messages/stream/open.json');
      const adbClient = new AdbClient(mockTransport, options, new MockKeyStore());
      const stream = await Stream.open(adbClient, 'test:', options);
      expect(stream.localId).toBe(1);
      expect(stream.remoteId).toBe(34); // Defined in open.json
      expect(stream.service).toBe('test:');
    });
  });

  describe('#consumeMessage', () => {
    it('Caps unread messages to MAX_PENDING_MESSAGES to prevent unbounded retention', () => {
      const mockTransport = new MockTransport();
      const adbClient = new AdbClient(mockTransport, options, new MockKeyStore());
      const stream = new Stream(adbClient, 'test:', 1, 34, options);
      const msg = Message.newMessage('WRTE', 34, 1, false);
      for (let i = 0; i < 300; i++) {
        expect(stream.consumeMessage(msg)).toBeTrue();
      }
      expect((stream as unknown as {messageQueue: {size: number}}).messageQueue.size).toBe(256);
    });
  });
});
