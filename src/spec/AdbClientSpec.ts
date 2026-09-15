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
import {Message, MessageHeader} from '../lib/message';
import {KeyStore} from '../lib/KeyStore';
import {Transport} from '../lib/transport';

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

  describe('#generateKey', () => {
    it('produces a non-extractable private key and does not log private key when dump=false', async () => {
      const logSpy = spyOn(console, 'log');
      const key = await AdbClient.generateKey(false, 2048);
      expect(key.privateKey.extractable).toBe(false);
      await expectAsync(crypto.subtle.exportKey('pkcs8', key.privateKey)).toBeRejected();
      expect(logSpy).not.toHaveBeenCalledWith(jasmine.stringMatching(/-----BEGIN PRIVATE KEY-----/));
    });

    it('produces a non-extractable private key when dump=true', async () => {
      const key = await AdbClient.generateKey(true, 2048);
      expect(key.privateKey.extractable).toBe(false);
    });

    it('rejects private key export via Web Crypto exportKey() even when dump=true', async () => {
      const key = await AdbClient.generateKey(true, 2048);
      await expectAsync(crypto.subtle.exportKey('pkcs8', key.privateKey)).toBeRejected();
    });

    it('does not log PKCS#8 private key to console when dump=true', async () => {
      const logSpy = spyOn(console, 'log');
      await AdbClient.generateKey(true, 2048);
      expect(logSpy).not.toHaveBeenCalledWith(jasmine.stringMatching(/-----BEGIN PRIVATE KEY-----/));
    });

    it('persists a non-extractable private key to KeyStore during connect() when dump=true', async () => {
      let savedKey: CryptoKeyPair | undefined;
      const capturingKeyStore: KeyStore = {
        loadKeys: () => Promise.resolve([]),
        saveKey: (k: CryptoKeyPair) => {
          savedKey = k;
          return Promise.resolve();
        },
      };
      const dumpOptions: Options = {
        ...options,
        dump: true,
      };

      const transport = new MockTransport();
      await transport.pushFromFile('src/spec/data/messages/connect/connect_auth_public_key.json');
      const adbClient = new AdbClient(transport, dumpOptions, capturingKeyStore);
      await adbClient.connect();

      expect(savedKey).toBeDefined();
      expect(savedKey!.privateKey.extractable).toBe(false);
    });
  });

  describe('#doAuth - token signing behavior', () => {
    it('limits signature attempts to at most one key per connection', async () => {
      const key1 = await AdbClient.generateKey(false, 2048);
      const key2 = await AdbClient.generateKey(false, 2048);
      const keyStore: KeyStore = {
        loadKeys: () => Promise.resolve([key1, key2]),
        saveKey: () => Promise.resolve(),
      };

      const transport = new DiscreteMockTransport();
      const token = new Uint8Array(20).fill(0x11);
      const tokenDataView = new DataView(token.buffer);

      // Device sends AUTH challenge with 20-byte token
      transport.pushMessage(Message.newMessage('AUTH', 1, 0, false, tokenDataView));
      // Device rejects first signature with non-CNXN response (another AUTH)
      transport.pushMessage(Message.newMessage('AUTH', 1, 0, false, tokenDataView));
      // Device accepts next response with CNXN
      transport.pushMessage(Message.newMessage(
          'CNXN', 1, 65536, false,
          new DataView(new TextEncoder().encode('host://').buffer)));

      const adbClient = new AdbClient(transport, options, keyStore);
      await adbClient.connect();

      const outbound = extractOutboundMessages(transport.receivedData);
      const signatures = outbound.filter(
          (m) => m.header.cmd === 'AUTH' && m.header.arg0 === 2);

      // Desired: At most one signature attempt per connection
      expect(signatures.length).toBe(1);
    });

    it('does not iterate through all stored keys when signatures are rejected', async () => {
      const key1 = await AdbClient.generateKey(false, 2048);
      const key2 = await AdbClient.generateKey(false, 2048);
      const key3 = await AdbClient.generateKey(false, 2048);
      const keyStore: KeyStore = {
        loadKeys: () => Promise.resolve([key1, key2, key3]),
        saveKey: () => Promise.resolve(),
      };

      const transport = new DiscreteMockTransport();
      const token = new Uint8Array(20).fill(0x22);
      const tokenDataView = new DataView(token.buffer);

      // Device sends AUTH challenge, rejects signature, then accepts newly generated public key
      transport.pushMessage(Message.newMessage('AUTH', 1, 0, false, tokenDataView));
      transport.pushMessage(Message.newMessage('AUTH', 1, 0, false, tokenDataView));
      transport.pushMessage(Message.newMessage(
          'CNXN', 1, 65536, false,
          new DataView(new TextEncoder().encode('host://').buffer)));

      const adbClient = new AdbClient(transport, options, keyStore);
      await adbClient.connect();

      const outbound = extractOutboundMessages(transport.receivedData);
      const signatures = outbound.filter(
          (m) => m.header.cmd === 'AUTH' && m.header.arg0 === 2);

      // Desired: Does not try all 3 keys; bounds signature attempts
      expect(signatures.length).toBe(1);
    });

    it('rejects authentication challenges with invalid token length', async () => {
      const key = await AdbClient.generateKey(false, 2048);
      const keyStore: KeyStore = {
        loadKeys: () => Promise.resolve([key]),
        saveKey: () => Promise.resolve(),
      };

      const transport = new DiscreteMockTransport();
      // Non-standard 64-byte token
      const token64 = new Uint8Array(64).fill(0x33);
      const tokenDataView = new DataView(token64.buffer);

      transport.pushMessage(Message.newMessage('AUTH', 1, 0, false, tokenDataView));
      transport.pushMessage(Message.newMessage(
          'CNXN', 1, 65536, false,
          new DataView(new TextEncoder().encode('host://').buffer)));

      const adbClient = new AdbClient(transport, options, keyStore);

      // Desired: Reject non-20-byte challenge token
      await expectAsync(adbClient.connect()).toBeRejected();
    });
  });
});

class DiscreteMockTransport implements Transport {
  public receivedData: DataView[] = [];
  private readBuffer: Uint8Array = new Uint8Array(0);
  reject?: (reason: Error) => void;

  pushMessage(msg: Message): void {
    const headerBytes = new Uint8Array(msg.header.toDataView().buffer);
    const dataBytes = msg.data ?
        new Uint8Array(msg.data.buffer, msg.data.byteOffset, msg.data.byteLength) :
        new Uint8Array(0);
    const total = new Uint8Array(this.readBuffer.length + headerBytes.length + dataBytes.length);
    total.set(this.readBuffer, 0);
    total.set(headerBytes, this.readBuffer.length);
    total.set(dataBytes, this.readBuffer.length + headerBytes.length);
    this.readBuffer = total;
  }

  async read(len: number): Promise<DataView> {
    if (this.readBuffer.length < len) {
      return new Promise((_, reject) => {
        this.reject = reject;
      });
    }
    const chunk = this.readBuffer.slice(0, len);
    this.readBuffer = this.readBuffer.slice(len);
    return new DataView(chunk.buffer);
  }

  async write(data: ArrayBuffer): Promise<void> {
    this.receivedData.push(new DataView(data.slice(0)));
  }

  close(): void {
    if (this.reject) {
      this.reject(new Error('Transport Closed'));
    }
  }
}

function extractOutboundMessages(receivedData: DataView[]): Message[] {
  const messages: Message[] = [];
  let i = 0;
  while (i < receivedData.length) {
    const headerView = receivedData[i++];
    const header = MessageHeader.parse(headerView, false);
    let dataView: DataView | undefined;
    if (header.length > 0 && i < receivedData.length) {
      dataView = receivedData[i++];
    }
    messages.push(new Message(header, dataView));
  }
  return messages;
}


