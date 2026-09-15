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
import {encodeCmd} from '../lib/Helpers';
import {SYNC_DATA_MAX} from '../lib/SyncFrame';

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

  describe('#pull', () => {
    it('rejects when receiving a DATA chunk that exceeds the 64 KiB protocol maximum', async () => {
      const mockTransport = new MockTransport();
      const adbClient = new AdbClient(mockTransport, options, new MockKeyStore());
      const stream = new Stream(adbClient, 'sync:', 1, 34, options);

      // Handshake: device sends OKAY for RECV command and OKAY for remote path
      stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));
      stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));

      // Device sends a DATA frame with byteLength exceeding the 64 KiB limit
      const oversizedChunkSize = SYNC_DATA_MAX + 1;
      const payload = new Uint8Array(8 + oversizedChunkSize + 8);
      const view = new DataView(payload.buffer);
      view.setUint32(0, encodeCmd('DATA'), true);
      view.setUint32(4, oversizedChunkSize, true);
      // Trailing DONE frame
      view.setUint32(8 + oversizedChunkSize, encodeCmd('DONE'), true);
      view.setUint32(8 + oversizedChunkSize + 4, 0, true);

      stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, view));

      await expectAsync(stream.pull('/test/file')).toBeRejectedWithError(
          /sync: DATA chunk length \d+ exceeds protocol maximum of 65536/);
    });

    it('rejects when a subsequent DATA chunk exceeds the 64 KiB protocol maximum', async () => {
      const mockTransport = new MockTransport();
      const adbClient = new AdbClient(mockTransport, options, new MockKeyStore());
      const stream = new Stream(adbClient, 'sync:', 1, 34, options);

      // Handshake: device sends OKAY for RECV command and OKAY for remote path
      stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));
      stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));

      // First chunk: valid 1024 bytes DATA frame
      const validChunkSize = 1024;
      const payload1 = new Uint8Array(8 + validChunkSize);
      const view1 = new DataView(payload1.buffer);
      view1.setUint32(0, encodeCmd('DATA'), true);
      view1.setUint32(4, validChunkSize, true);
      stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, view1));

      // Second chunk: oversized DATA frame of 70000 bytes followed by DONE
      const oversizedChunkSize = 70000;
      const payload2 = new Uint8Array(8 + oversizedChunkSize + 8);
      const view2 = new DataView(payload2.buffer);
      view2.setUint32(0, encodeCmd('DATA'), true);
      view2.setUint32(4, oversizedChunkSize, true);
      view2.setUint32(8 + oversizedChunkSize, encodeCmd('DONE'), true);
      view2.setUint32(8 + oversizedChunkSize + 4, 0, true);
      stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, view2));

      await expectAsync(stream.pull('/test/file')).toBeRejectedWithError(
          /sync: DATA chunk length \d+ exceeds protocol maximum of 65536/);
    });

    it('rejects when device leaves fewer than 8 bytes after a DATA frame', async () => {
      const mockTransport = new MockTransport();
      const adbClient = new AdbClient(mockTransport, options, new MockKeyStore());
      const stream = new Stream(adbClient, 'sync:', 1, 34, options);

      // Handshake: device sends OKAY for RECV command and OKAY for remote path
      stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));
      stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));

      // Device sends a DATA frame with 4 bytes of payload followed by 2 trailing bytes
      // instead of a complete 8-byte SyncFrame header.
      const dataPayloadSize = 4;
      const trailingBytes = 2;
      const payload = new Uint8Array(8 + dataPayloadSize + trailingBytes);
      const view = new DataView(payload.buffer);
      view.setUint32(0, encodeCmd('DATA'), true);
      view.setUint32(4, dataPayloadSize, true);
      payload.set([0x41, 0x41, 0x41, 0x41], 8);
      payload.set([0x58, 0x58], 8 + dataPayloadSize);

      stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, view));

      await expectAsync(stream.pull('/test/file')).toBeRejectedWithError(
          /truncated SyncFrame header/);
    });

    it('rejects when a subsequent message leaves fewer than 8 bytes after a DATA frame', async () => {
      const mockTransport = new MockTransport();
      const adbClient = new AdbClient(mockTransport, options, new MockKeyStore());
      const stream = new Stream(adbClient, 'sync:', 1, 34, options);

      // Handshake: device sends OKAY for RECV command and OKAY for remote path
      stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));
      stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));

      // First chunk: valid DATA frame with 4 bytes of payload (total 12 bytes)
      const dataPayloadSize = 4;
      const payload1 = new Uint8Array(8 + dataPayloadSize);
      const view1 = new DataView(payload1.buffer);
      view1.setUint32(0, encodeCmd('DATA'), true);
      view1.setUint32(4, dataPayloadSize, true);
      payload1.set([0x41, 0x41, 0x41, 0x41], 8);
      stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, view1));

      // Second message: only 2 trailing bytes instead of a complete 8-byte SyncFrame header
      const payload2 = new Uint8Array(2);
      payload2.set([0x58, 0x58], 0);
      const view2 = new DataView(payload2.buffer);
      stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, view2));

      await expectAsync(stream.pull('/test/file')).toBeRejectedWithError(
          /truncated SyncFrame header/);
    });

    it('rejects when initial sync response has fewer than 8 bytes', async () => {
      const mockTransport = new MockTransport();
      const adbClient = new AdbClient(mockTransport, options, new MockKeyStore());
      const stream = new Stream(adbClient, 'sync:', 1, 34, options);

      // Handshake: device sends OKAY for RECV command and OKAY for remote path
      stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));
      stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));

      // Device sends an initial WRTE message with fewer than 8 bytes
      const payload = new Uint8Array(4);
      const view = new DataView(payload.buffer);
      stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, view));

      await expectAsync(stream.pull('/test/file')).toBeRejectedWithError(
          /truncated SyncFrame header/);
    });
  });
});


