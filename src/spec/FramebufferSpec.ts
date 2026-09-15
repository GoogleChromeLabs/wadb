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
import {Framebuffer} from '../lib/Framebuffer';
import {Options} from '../lib/Options';
import {Transport} from '../lib/transport';
import {Message, MessageHeader} from '../lib/message';
import {MockKeyStore} from './mock/MockKeyStore';

describe('Framebuffer', () => {
  const keyStore = new MockKeyStore();
  const options = {
    debug: false,
    dump: false,
    useChecksum: false,
    keySize: 2048,
  } as Options;

  function createFbInfoDataView(fields: {
    version?: number;
    bpp?: number;
    colorSpace?: number;
    size: number;
    width: number;
    height: number;
    redOffset?: number;
    redLength?: number;
    blueOffset?: number;
    blueLength?: number;
    greenOffset?: number;
    greenLength?: number;
    alphaOffset?: number;
    alphaLength?: number;
    trailingBytes?: number;
  }): DataView {
    const trailing = fields.trailingBytes ?? 0;
    const buffer = new ArrayBuffer(56 + trailing);
    const view = new DataView(buffer);
    view.setUint32(0, fields.version ?? 1, true);
    view.setUint32(4, fields.bpp ?? 32, true);
    view.setUint32(8, fields.colorSpace ?? 0, true);
    view.setUint32(12, fields.size, true);
    view.setUint32(16, fields.width, true);
    view.setUint32(20, fields.height, true);
    view.setUint32(24, fields.redOffset ?? 0, true);
    view.setUint32(28, fields.redLength ?? 8, true);
    view.setUint32(32, fields.blueOffset ?? 16, true);
    view.setUint32(36, fields.blueLength ?? 8, true);
    view.setUint32(40, fields.greenOffset ?? 8, true);
    view.setUint32(44, fields.greenLength ?? 8, true);
    view.setUint32(48, fields.alphaOffset ?? 24, true);
    view.setUint32(52, fields.alphaLength ?? 8, true);
    return view;
  }

  describe('#create', () => {
    it('rejects when framebuffer size exceeds the maximum limit of 64 MiB', async () => {
      const transport = new FramebufferMockTransport();
      const adbClient = new AdbClient(transport, options, keyStore);

      const remoteId = 42;
      let localId: number | undefined;

      // 65 MiB framebuffer (exceeds 64 MiB limit)
      // width = 4096, height = 4160, bpp = 32 -> 4096 * 4160 * 4 = 68,157,440 bytes
      const oversizedSize = 65 * 1024 * 1024;
      const fbinfo = createFbInfoDataView({
        size: oversizedSize,
        width: 4096,
        height: 4160,
        bpp: 32,
      });

      transport.onWrite = (msg: Message) => {
        if (msg.header.cmd === 'OPEN') {
          localId = msg.header.arg0;
          transport.pushMessage(Message.newMessage('OKAY', remoteId, localId, false));
          setTimeout(() => {
            if (localId !== undefined) {
              transport.pushMessage(Message.newMessage('WRTE', remoteId, localId, false, fbinfo));
            }
          }, 5);
        } else if (msg.header.cmd === 'OKAY' && localId !== undefined) {
          transport.pushMessage(Message.newMessage('CLSE', remoteId, localId, false));
        }
      };

      await expectAsync(Framebuffer.create(adbClient, options)).toBeRejectedWithError(
          /Rejecting framebuffer: size=68157440 exceeds 67108864/);
    });

    it('rejects when framebuffer size does not match width * height * (bpp / 8)', async () => {
      const transport = new FramebufferMockTransport();
      const adbClient = new AdbClient(transport, options, keyStore);

      const remoteId = 42;
      let localId: number | undefined;

      // width = 100, height = 100, bpp = 32 -> expected size = 40,000 bytes
      // Device supplies mismatched size = 20,000 bytes
      const fbinfo = createFbInfoDataView({
        size: 20000,
        width: 100,
        height: 100,
        bpp: 32,
      });

      transport.onWrite = (msg: Message) => {
        if (msg.header.cmd === 'OPEN') {
          localId = msg.header.arg0;
          transport.pushMessage(Message.newMessage('OKAY', remoteId, localId, false));
          setTimeout(() => {
            if (localId !== undefined) {
              transport.pushMessage(Message.newMessage('WRTE', remoteId, localId, false, fbinfo));
            }
          }, 5);
        } else if (msg.header.cmd === 'OKAY' && localId !== undefined) {
          transport.pushMessage(Message.newMessage('CLSE', remoteId, localId, false));
        }
      };

      await expectAsync(Framebuffer.create(adbClient, options)).toBeRejectedWithError(
          /Rejecting framebuffer: size=20000 .* does not match width\*height\*bpp\/8=40000/);
    });

    it('rejects when framebuffer size is excessively large', async () => {
      const transport = new FramebufferMockTransport();
      const adbClient = new AdbClient(transport, options, keyStore);

      const remoteId = 42;
      let localId: number | undefined;

      // Unbounded 32-bit size: 0xFFFFFFF0 (4,294,967,280 bytes)
      const fbinfo = createFbInfoDataView({
        size: 0xFFFFFFF0,
        width: 1,
        height: 1,
        bpp: 32,
      });

      transport.onWrite = (msg: Message) => {
        if (msg.header.cmd === 'OPEN') {
          localId = msg.header.arg0;
          transport.pushMessage(Message.newMessage('OKAY', remoteId, localId, false));
          setTimeout(() => {
            if (localId !== undefined) {
              transport.pushMessage(Message.newMessage('WRTE', remoteId, localId, false, fbinfo));
            }
          }, 5);
        } else if (msg.header.cmd === 'OKAY' && localId !== undefined) {
          transport.pushMessage(Message.newMessage('CLSE', remoteId, localId, false));
        }
      };

      await expectAsync(Framebuffer.create(adbClient, options)).toBeRejectedWithError(
          /Rejecting framebuffer: size=4294967280 exceeds 67108864/);
    });

    it('closes the stream when rejecting an invalid framebuffer size', async () => {
      const transport = new FramebufferMockTransport();
      const adbClient = new AdbClient(transport, options, keyStore);

      const remoteId = 42;
      let localId: number | undefined;

      const fbinfo = createFbInfoDataView({
        size: 0xFFFFFFF0,
        width: 1,
        height: 1,
        bpp: 32,
      });

      transport.onWrite = (msg: Message) => {
        if (msg.header.cmd === 'OPEN') {
          localId = msg.header.arg0;
          transport.pushMessage(Message.newMessage('OKAY', remoteId, localId, false));
          setTimeout(() => {
            if (localId !== undefined) {
              transport.pushMessage(Message.newMessage('WRTE', remoteId, localId, false, fbinfo));
            }
          }, 5);
        } else if (msg.header.cmd === 'OKAY' && localId !== undefined) {
          transport.pushMessage(Message.newMessage('CLSE', remoteId, localId, false));
        }
      };

      try {
        await Framebuffer.create(adbClient, options);
      } catch {
        // Expected rejection
      }

      const closeMessages = transport.outboundMessages.filter(
          (m) => m.header.cmd === 'CLSE' && m.header.arg0 === localId);
      expect(closeMessages.length).toBeGreaterThan(0);
    });
  });
});

class FramebufferMockTransport implements Transport {
  public receivedData: DataView[] = [];
  public outboundMessages: Message[] = [];
  private readBuffer: Uint8Array = new Uint8Array(0);
  private pendingRead?: {
    len: number;
    resolve: (data: DataView) => void;
    reject: (err: Error) => void;
  };
  public onWrite?: (msg: Message) => void;
  private writeBuffer: Uint8Array = new Uint8Array(0);

  pushData(data: Uint8Array): void {
    const combined = new Uint8Array(this.readBuffer.length + data.length);
    combined.set(this.readBuffer, 0);
    combined.set(data, this.readBuffer.length);
    this.readBuffer = combined;
    this.checkPendingRead();
  }

  pushMessage(msg: Message): void {
    const headerBytes = new Uint8Array(msg.header.toDataView().buffer);
    this.pushData(headerBytes);
    if (msg.data) {
      const dataBytes = new Uint8Array(msg.data.buffer, msg.data.byteOffset, msg.data.byteLength);
      this.pushData(dataBytes);
    }
  }

  private checkPendingRead(): void {
    if (this.pendingRead && this.readBuffer.length >= this.pendingRead.len) {
      const {len, resolve} = this.pendingRead;
      this.pendingRead = undefined;
      const chunk = this.readBuffer.slice(0, len);
      this.readBuffer = this.readBuffer.slice(len);
      resolve(new DataView(chunk.buffer));
    }
  }

  async read(len: number): Promise<DataView> {
    if (this.readBuffer.length >= len) {
      const chunk = this.readBuffer.slice(0, len);
      this.readBuffer = this.readBuffer.slice(len);
      return new DataView(chunk.buffer);
    }
    return new Promise<DataView>((resolve, reject) => {
      this.pendingRead = {len, resolve, reject};
    });
  }

  async write(data: ArrayBuffer): Promise<void> {
    this.receivedData.push(new DataView(data.slice(0)));
    const chunk = new Uint8Array(data);
    const combined = new Uint8Array(this.writeBuffer.length + chunk.length);
    combined.set(this.writeBuffer, 0);
    combined.set(chunk, this.writeBuffer.length);
    this.writeBuffer = combined;

    while (this.writeBuffer.length >= 24) {
      const headerView = new DataView(this.writeBuffer.buffer, this.writeBuffer.byteOffset, 24);
      const header = MessageHeader.parse(headerView, false);
      const totalLen = 24 + header.length;
      if (this.writeBuffer.length < totalLen) {
        break;
      }
      let dataView: DataView | undefined;
      if (header.length > 0) {
        dataView = new DataView(this.writeBuffer.buffer, this.writeBuffer.byteOffset + 24, header.length);
      }
      const msg = new Message(header, dataView);
      this.writeBuffer = this.writeBuffer.slice(totalLen);
      this.outboundMessages.push(msg);
      if (this.onWrite) {
        this.onWrite(msg);
      }
    }
  }

  close(): void {
    if (this.pendingRead) {
      this.pendingRead.reject(new Error('Transport Closed'));
    }
  }
}
