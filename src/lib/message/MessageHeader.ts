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

import {encodeCmd, decodeCmd} from '../Helpers';

/**
 * The header of an ADB message. A header is made of 6 fields, each one with 4 bytes:
 *
 * - command: The command that this message represents.
 * - arg0: The meaning depends on the command.
 * - arg1: The meaning depends on the command.
 * - length: The length of the data part of the message.
 * - checksum: Checksum for the data part of the message. Only used in version 0x01000000 of the
 *   protocol.
 * - magic: a checksum for the command. Effectivelly, `command ^ 0xffffffff`.
 */
export class MessageHeader {

  /**
   * Creates a new MessageHeader
   *
   * @param {string} cmd The command that this message represents.
   * @param {number} arg0 The meaning depends on the command.
   * @param {number} arg1 The meaning depends on the command.
   * @param {number} length The length of the data part of the message.
   * @param {number} checksum Checksum for the data part of the message. Only used in version 0x01000000 of the
   * protocol.
   */
  constructor(
    readonly cmd: string,
    readonly arg0: number,
    readonly arg1: number,
    readonly length: number,
    readonly checksum: number) {
  }

  /**
   * Converts the MessageHeader into a {@link DataView}.
   * @returns {DataView} a DataView with 24 bytes, with the header content.
   */
  toDataView(): DataView {
    const view = new DataView(new ArrayBuffer(24));
    const rawCmd = encodeCmd(this.cmd);
    const magic = rawCmd ^ 0xffffffff;
		view.setUint32(0, rawCmd, true);
		view.setUint32(4, this.arg0, true);
		view.setUint32(8, this.arg1, true);
		view.setUint32(12, this.length, true);
		view.setUint32(16, this.checksum, true);
    view.setUint32(20, magic, true);
    return view;
  }

  /**
   * Creates a header from a {@link DataView}.
   * @param {DataView} data the {@link DataView} that will be used to create the header.
   * @param {boolean} useChecksum if the checksum should be verified.
   */
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

    return new MessageHeader(decodeCmd(cmd), arg0, arg1, len, checksum);
  }
}
