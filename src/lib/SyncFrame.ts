/**
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

import {encodeCmd, decodeCmd} from './Helpers';

// Per the ADB SYNC protocol, individual DATA chunks are never larger than 64k.
export const SYNC_DATA_MAX = 64 * 1024;

export class SyncFrame {
  constructor(readonly cmd: string, readonly byteLength: number) {
    if (cmd === 'DATA' && byteLength > SYNC_DATA_MAX) {
      throw new Error(
          `sync: DATA chunk length ${byteLength} exceeds protocol maximum of ${SYNC_DATA_MAX}`);
    }
  }

  toDataView(): DataView {
    const data = new ArrayBuffer(8);
    const cmd = encodeCmd(this.cmd);

    const view = new DataView(data);
    view.setUint32(0, cmd, true);
    view.setUint32(4, this.byteLength, true);
    return view;
  }

  static fromDataView(dataView: DataView): SyncFrame {
    const cmd = decodeCmd(dataView.getUint32(0, true));
    const byteLength = dataView.getUint32(4, true);
    return new SyncFrame(cmd, byteLength);
  }
}
