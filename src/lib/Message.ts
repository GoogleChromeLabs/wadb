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

export class MessageHeader {
  constructor(
    readonly cmd: string,
    readonly arg0: number,
    readonly arg1: number,
    readonly length: number,
    readonly checksum: number) {
  }

  toDataView(): DataView {
    const view = new DataView(new ArrayBuffer(24));
    const rawCmd = MessageHeader.encodeCmd(this.cmd);
    const magic = rawCmd ^ 0xffffffff;
		view.setUint32(0, rawCmd, true);
		view.setUint32(4, this.arg0, true);
		view.setUint32(8, this.arg1, true);
		view.setUint32(12, this.length, true);
		view.setUint32(16, this.checksum, true);
    view.setUint32(20, magic, true);
    return view;
  }

  static parse(data: DataView, useChecksum = false): MessageHeader {
    const cmd = data.getUint32(0, true);
    const arg0 = data.getUint32(4, true);
    const arg1 = data.getUint32(8, true);
    const len = data.getUint32(12, true);
    const checksum = data.getUint32(16, true);

     // Android seems to have stopped providing checksums
     if (useChecksum && data.byteLength > 20) {
      const magic = data.getUint32(20, true);

      if ((cmd ^ magic) !== -1) {
        throw new Error('magic mismatch');
      }
    }

    return new MessageHeader(MessageHeader.decodeCmd(cmd), arg0, arg1, len, checksum);
  }

  private static encodeCmd(cmd: string): number {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(cmd).buffer;
    const view = new DataView(buffer);
    return view.getUint32(0, true);
  }

  private static decodeCmd(cmd: number): string {
    const decoder = new TextDecoder();
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, cmd, true);
    return decoder.decode(buffer);
  }
}

export class Message {
  constructor(
    readonly header: MessageHeader,
    readonly data?: DataView,
  ){}

  dataAsString(): string | null {
    if (!this.data) {
      return null;
    }

    const textDecoder = new TextDecoder();
    return textDecoder.decode(this.data);
  }

  static newMessage(
      cmd: string, arg0: number, arg1: number, useChecksum: boolean, data?: DataView) {
    let checksum = 0;
    let byteLength = 0;
    if (data) {
      byteLength = data.byteLength;
      if (useChecksum) {
        checksum = Message.checksum(data);
      }
    }
    const header = new MessageHeader(cmd, arg0, arg1, byteLength, checksum);
    return new Message(header, data);
  }

  static open(localId: number, remoteId: number, service: string, useChecksum: boolean): Message {
    const encoder = new TextEncoder();
    const data = new DataView(encoder.encode('' + service + '\0').buffer);
    return Message.newMessage('OPEN', localId, remoteId, useChecksum, data);
  }

  static cnxn(version: number, maxPayload: number, banner: string, useChecksum: boolean): Message {
    const encoder = new TextEncoder();
    const data = new DataView(encoder.encode(banner).buffer);
    return Message.newMessage('CNXN', version, maxPayload, useChecksum, data);
  }

  static authSignature(signedToken: DataView, useChecksum: boolean): Message {
    return Message.newMessage('AUTH', 2, 0, useChecksum, signedToken);
  }

  static authPublicKey(publicKey: DataView, useChecksum: boolean): Message {
    return Message.newMessage('AUTH', 3, 0, useChecksum, publicKey);
  }

  static checksum(dataView: DataView): number {
    let sum = 0;
		for (let i = 0; i < dataView.byteLength; i++) {
      sum += dataView.getUint8(i);
    }
		return sum & 0xffffffff;
  }
}
