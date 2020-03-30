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

import MessageHeader from './MessageHeader';
import { toB64 } from '../Helpers';

export default class Message {
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
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(toB64(publicKey.buffer) + '\0');
    return Message.newMessage('AUTH', 3, 0, useChecksum, new DataView(data.buffer));
  }

  static checksum(dataView: DataView): number {
    let sum = 0;
		for (let i = 0; i < dataView.byteLength; i++) {
      sum += dataView.getUint8(i);
    }
		return sum & 0xffffffff;
  }
}
