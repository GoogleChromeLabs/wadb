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

export default class MessageHeader {
  constructor(
    readonly cmd: string,
    readonly arg0: number,
    readonly arg1: number,
    readonly length: number,
    readonly checksum: number) {
  }

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
