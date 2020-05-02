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
import {SyncFrame} from '../lib/SyncFrame';

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
  })
});
