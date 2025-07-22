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

import {AdbClient} from '../lib/AdbClient';
import {MockTransport} from './mock/MockTransport';
import {MockKeyStore} from './mock/MockKeyStore';
import {Options} from '../lib/Options';

describe('AdbClient', () => {
  const keyStore = new MockKeyStore();
  const options = {
    debug: false,
    dump: false,
    useChecksum: false,
    keySize: 2048,
  } as Options;

  describe('#connect', () => {
    // Node doesn't have a global btoa function. We patch it here for the test.
    globalThis.btoa = (input: string): string => {
      return Buffer.from(input).toString('base64');
    };

    let transport: MockTransport;

    beforeEach(() => {
      transport = new MockTransport();
    });

    it('Server doesn\'t request AUTH and responds with CNXN', async () => {
      await transport.pushFromFile('src/spec/data/messages/connect/connect_simple.json');
      const adbClient = new AdbClient(transport, options, keyStore);
      const adbDeviceInfo = await adbClient.connect();
      expect(adbDeviceInfo).toBeDefined();
    });

    it('Server responds with AUTH and then CNXN', async () => {
      await transport.pushFromFile('src/spec/data/messages/connect/connect_auth_public_key.json');
      const adbClient = new AdbClient(transport, options, keyStore);
      const adbDeviceInfo = await adbClient.connect();
      expect(adbDeviceInfo).toBeDefined();
    });
  });
});
