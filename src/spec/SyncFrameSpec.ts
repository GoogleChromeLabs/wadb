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

import {encodeCmd} from '../lib/Helpers';
import {SyncFrame, SYNC_DATA_MAX} from '../lib/SyncFrame';

describe('SyncFrame', () => {
  describe('#fromDataView', () => {
    it('Reads a SyncFrame from a DataView', () => {
      const dataView = new DataView(new ArrayBuffer(8));
      dataView.setUint32(0, encodeCmd('WRTE'), true);
      dataView.setUint32(4, 256, true);
      const syncFrame = SyncFrame.fromDataView(dataView);
      expect(syncFrame.cmd).toBe('WRTE');
      expect(syncFrame.byteLength).toBe(256);
    });
  });

  describe('#toDataView', () => {
    it('Writes a SyncFrame to a DataView', () => {
      const syncFrame = new SyncFrame('WRTE', 256);
      const dataView = syncFrame.toDataView();
      const encodedCmd = encodeCmd('WRTE');
      expect(dataView.getUint32(0, true)).toBe(encodedCmd);
      expect(dataView.getUint32(4, true)).toBe(256);
    });
  });

  describe('DATA chunk size validation', () => {
    it('accepts DATA frame with byteLength equal to or less than 64 KiB', () => {
      const frame = new SyncFrame('DATA', SYNC_DATA_MAX);
      expect(frame.byteLength).toBe(SYNC_DATA_MAX);

      const dataView = new DataView(new ArrayBuffer(8));
      dataView.setUint32(0, encodeCmd('DATA'), true);
      dataView.setUint32(4, SYNC_DATA_MAX, true);
      const parsed = SyncFrame.fromDataView(dataView);
      expect(parsed.byteLength).toBe(SYNC_DATA_MAX);
    });

    it('rejects DATA frame with byteLength exceeding 64 KiB in constructor', () => {
      expect(() => new SyncFrame('DATA', SYNC_DATA_MAX + 1))
          .toThrowError(/sync: DATA chunk length 65537 exceeds protocol maximum of 65536/);
    });

    it('rejects DATA frame with byteLength exceeding 64 KiB in fromDataView', () => {
      const dataView = new DataView(new ArrayBuffer(8));
      dataView.setUint32(0, encodeCmd('DATA'), true);
      dataView.setUint32(4, SYNC_DATA_MAX + 1, true);
      expect(() => SyncFrame.fromDataView(dataView))
          .toThrowError(/sync: DATA chunk length 65537 exceeds protocol maximum of 65536/);
    });

    it('allows non-DATA frames (such as DONE) with values greater than 64 KiB', () => {
      const timestamp = 1700000000;
      const doneFrame = new SyncFrame('DONE', timestamp);
      expect(doneFrame.byteLength).toBe(timestamp);

      const dataView = new DataView(new ArrayBuffer(8));
      dataView.setUint32(0, encodeCmd('DONE'), true);
      dataView.setUint32(4, timestamp, true);
      const parsed = SyncFrame.fromDataView(dataView);
      expect(parsed.byteLength).toBe(timestamp);
    });
  });
});
