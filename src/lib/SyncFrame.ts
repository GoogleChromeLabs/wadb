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

 export default class SyncFrame {
  constructor(readonly cmd: string, readonly byteLength: number) {

  }

  toDataView(): DataView {
    const data = new ArrayBuffer(8);
    const cmd = SyncFrame.encodeCmd(this.cmd);

    const view = new DataView(data);
    view.setUint32(0, cmd, true);
    view.setUint32(4, this.byteLength, true);
    return view;
  }

  static fromDataView(dataView: DataView): SyncFrame {
    const cmd = SyncFrame.decodeCmd(dataView.getUint32(0, true));
    const byteLength = dataView.getUint32(4, true);
    return new SyncFrame(cmd, byteLength);
  }

  // static fromDataViews(dataView: DataView): Array<SyncFrame> {
  //   const syncFrames = [];
  //   let start = 0;
  //   do {
  //     const cmd = SyncFrame.decodeCmd(dataView.getUint32(start, true));
  //     const byteLength = dataView.getUint32(start + 4, true);
  //     console.log('cmd: ', cmd, ' byteLength: ', byteLength);
  //     const data = new DataView(dataView.buffer.slice(start + 8, start + byteLength + 8));
  //     start = start + byteLength + 8;
  //     syncFrames.push(new SyncFrame(cmd, byteLength, data));
  //     console.log(start, dataView.byteLength);

  //   } while (start < dataView.byteLength);
  //   return syncFrames;
  // }

  // TODO(andreban): dedup this from `Message.encodeCmd`
  private static encodeCmd(cmd: string): number {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(cmd).buffer;
    const view = new DataView(buffer);
    return view.getUint32(0, true);
  }

// TODO(andreban): dedup this from `Message.decodeCmd`
  private static decodeCmd(cmd: number): string {
    const decoder = new TextDecoder();
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, cmd, true);
    return decoder.decode(buffer);
  }
 }
