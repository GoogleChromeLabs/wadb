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

import {Message} from '../../lib/message';

describe('Message', () => {
  describe('#newMessage', () => {
    it('Creates a message without data', () => {
      const message = Message.newMessage('CNXN', 1, 2, true);
      expect(message.header.cmd).toBe('CNXN');
      expect(message.header.arg0).toBe(1);
      expect(message.header.arg1).toBe(2);
      expect(message.header.length).toBe(0);
      expect(message.header.checksum).toBe(0);
      expect(message.data).toBeUndefined();
    });

    it('Creates a message with data and checksum enabled', () => {
      const data = new DataView(new TextEncoder().encode('test').buffer);
      const message = Message.newMessage('CNXN', 1, 2, true, data);
      expect(message.header.cmd).toBe('CNXN');
      expect(message.header.arg0).toBe(1);
      expect(message.header.arg1).toBe(2);
      expect(message.header.length).toBe(data.byteLength);
      expect(message.header.checksum).toBe(448);
      expect(message.data).toEqual(data);
    });

    it('Creates a message with data and checksum disabled', () => {
      const data = new DataView(new TextEncoder().encode('test').buffer);
      const message = Message.newMessage('CNXN', 1, 2, false, data);
      expect(message.header.cmd).toBe('CNXN');
      expect(message.header.arg0).toBe(1);
      expect(message.header.arg1).toBe(2);
      expect(message.header.length).toBe(data.byteLength);
      expect(message.header.checksum).toBe(0);
      expect(message.data).toEqual(data);
    });
  });

  describe('#dataAsString', () => {
    it('Returns correct string value for data', () => {
      const data = new DataView(new TextEncoder().encode('test').buffer);
      const message = Message.newMessage('CNXN', 1, 2, false, data);
      expect(message.dataAsString()).toBe('test');
    });

    it('Returns null if data is not available', () => {
      const message = Message.newMessage('CNXN', 1, 2, false);
      expect(message.dataAsString()).toBeNull()
    });
  });

  describe('#open', () => {
    it('Creates an OPEN message', () => {
      const message = Message.open(1, 2, 'service', true);
      expect(message.header.cmd).toBe('OPEN');
      expect(message.header.arg0).toBe(1);
      expect(message.header.arg1).toBe(2);
      expect(message.header.length).toBe(8);
      expect(message.header.checksum).toBe(753);
    });
  });

  describe('#cnxn', () => {
    it('Creates an CNXN message', () => {
      const message = Message.cnxn(1, 2, 'banner', true);
      expect(message.header.cmd).toBe('CNXN');
      expect(message.header.arg0).toBe(1);
      expect(message.header.arg1).toBe(2);
      expect(message.header.length).toBe(6);
      expect(message.header.checksum).toBe(630);
    });
  });

  describe('#authSignature', () => {
    it('Creates an AUTH message with a signed token', () => {
      const data = new DataView(new TextEncoder().encode('signed').buffer);
      const message = Message.authSignature(data, true);
      expect(message.header.cmd).toBe('AUTH');
      expect(message.header.arg0).toBe(2);
      expect(message.header.arg1).toBe(0);
      expect(message.header.length).toBe(6);
      expect(message.header.checksum).toBe(634);
    });
  });

  describe('#authPublicKey', () => {
    it('Creates an AUTH message with a public key', () => {
      // Node doesn't have a global btoa function. We patch it here for the test.
      globalThis.btoa = (input: string): string => {
        return Buffer.from(input).toString('base64');
      };
      const data = new DataView(new TextEncoder().encode('publickey').buffer);
      const message = Message.authPublicKey(data, true);
      expect(message.header.cmd).toBe('AUTH');
      expect(message.header.arg0).toBe(3);
      expect(message.header.arg1).toBe(0);
      expect(message.header.length).toBe(13);
      expect(message.header.checksum).toBe(1031);
    });
  });
});
