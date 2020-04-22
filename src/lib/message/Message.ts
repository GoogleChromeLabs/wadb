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

import {MessageHeader} from './MessageHeader';
import {toB64} from '../Helpers';

/**
 * An ADB Message. Contains a {@link MessageHeader} and an optional {@link DataView} with the
 * data for the message.
 */
export class Message {
  constructor(
    readonly header: MessageHeader,
    readonly data?: DataView,
  ){}

  /**
   * Returns the data content as a {@link string} or {@link null} if data is not available.
   * @returns {string | null} a {@link string} or {@link null} if data is not available.
   */
  dataAsString(): string | null {
    if (!this.data) {
      return null;
    }

    const textDecoder = new TextDecoder();
    return textDecoder.decode(this.data);
  }

  /**
   * Creates a new Message. See {@link MessageHeader}.
   * @param {string} cmd the command.
   * @param {number} arg0 value for the first argument.
   * @param {number} arg1 value for the second argument.
   * @param {boolean} useChecksum if the checksum for the data should be calculated.
   * @param {DataView} data message data.
   * @returns {Message} a new Message
   */
  static newMessage(
      cmd: string, arg0: number, arg1: number, useChecksum: boolean, data?: DataView): Message {
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

  /**
   * Creates a new `OPEN` message.
   * @param {number} localId local stream ID
   * @param {number} remoteId remote stream ID.
   * @param {string} service service description
   * @param {boolean} useChecksum if the checksum for the data should be calculated.
   * @returns {Message} a correctly setup message with an 'OPEN' command
   */
  static open(localId: number, remoteId: number, service: string, useChecksum: boolean): Message {
    const encoder = new TextEncoder();
    const data = new DataView(encoder.encode('' + service + '\0').buffer);
    return Message.newMessage('OPEN', localId, remoteId, useChecksum, data);
  }

  /**
   * Creates a new `CNXN` message.
   * @param {number} version version of the protocol to be used.
   * @param {number} maxPayload maximum payload size for the connection.
   * @param {string} banner host description.
   * @param {boolean} useChecksum if the checksum for the data should be calculated.
   * @returns {Message} a correctly setup message with an 'CNXN' command
   */
  static cnxn(version: number, maxPayload: number, banner: string, useChecksum: boolean): Message {
    const encoder = new TextEncoder();
    const data = new DataView(encoder.encode(banner).buffer);
    return Message.newMessage('CNXN', version, maxPayload, useChecksum, data);
  }

  /**
   * Creates a new `AUTH` message, with the a signed token.
   * @param {DataView} signedToken a DataView with the signed token.
   * @param {boolean} useChecksum if the checksum for the data should be calculated.
   * @returns {Message} a correctly setup message with an 'AUTH' command
   */
  static authSignature(signedToken: DataView, useChecksum: boolean): Message {
    return Message.newMessage('AUTH', 2, 0, useChecksum, signedToken);
  }

  /**
   * Creates a new `AUTH` message, with the a Public Key.
   * @param {DataView} publicKey a DataView with the public key
   * @param {boolean} useChecksum if the checksum for the data should be calculated.
   * @returns {Message} a correctly setup message with an 'AUTH' command
   */
  static authPublicKey(publicKey: DataView, useChecksum: boolean): Message {
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(toB64(publicKey.buffer) + '\0');
    return Message.newMessage('AUTH', 3, 0, useChecksum, new DataView(data.buffer));
  }

  private static checksum(dataView: DataView): number {
    let sum = 0;
		for (let i = 0; i < dataView.byteLength; i++) {
      sum += dataView.getUint8(i);
    }
		return sum & 0xffffffff;
  }
}
