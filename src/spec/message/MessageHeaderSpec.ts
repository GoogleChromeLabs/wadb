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

import {MessageHeader} from '../../lib/message';

describe('MessageHeader', () => {
  describe('#parse', () => {
    it('parses a messsage header, with checksum enabled', () => {
      const data = new DataView(new ArrayBuffer(24));
      data.setUint32(0, 0x4e584e43, true); // CNXN
      data.setUint32(4, 0x01000000, true); // Version
      data.setUint32(8, 256 * 1024, true); // Length
      data.setUint32(12, 16, true); // Length
      data.setUint32(16, 0, true); // Checksum
      data.setUint32(20, 0x4e584e43 ^ 0xffffffff, true); // Magic

      const header = MessageHeader.parse(data, true);
      expect(header.cmd).toBe('CNXN');
      expect(header.arg0).toBe(0x01000000);
      expect(header.arg1).toBe(256 * 1024);
      expect(header.length).toBe(16);
      expect(header.checksum).toBe(0);
    });

    it('Fails to parse a header with an invalid magic / checksum enabled', () => {
      const data = new DataView(new ArrayBuffer(24));
      data.setUint32(0, 0x4e584e43, true); // CNXN
      data.setUint32(4, 0x01000000, true); // Version
      data.setUint32(8, 256 * 1024, true); // Length
      data.setUint32(12, 16, true); // Length
      data.setUint32(16, 0, true); // Checksum
      data.setUint32(20, 0, true); // Magic
      expect((() => MessageHeader.parse(data, true))).toThrowError('magic mismatch');
    });
  });

  describe('#toDataView', () => {
    it ('converts a header to a DataView', () => {
      const data = new MessageHeader('CNXN', 0x01000000, 256 * 1024, 16, 0).toDataView();
      expect(data.getUint32(0, true)).toBe(0x4e584e43);
      expect(data.getUint32(4, true)).toBe(0x01000000);
      expect(data.getUint32(8, true)).toBe(256 * 1024);
      expect(data.getUint32(12, true)).toBe(16);
      expect(data.getUint32(16, true)).toBe(0);
      expect(data.getInt32(20, true)).toBe((0x4e584e43 ^ 0xffffffff));
    });
  });
});
