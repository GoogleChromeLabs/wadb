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

import {IDBFactory} from 'fake-indexeddb';
import {IndexedDbKeyStore} from '../lib/IndexedDbKeyStore';

// A minimal CryptoKeyPair stub for testing storage/retrieval without Web Crypto.
function makeFakeKeyPair(id: number): CryptoKeyPair {
  return {
    privateKey: {type: 'private', id} as unknown as CryptoKey,
    publicKey: {type: 'public', id} as unknown as CryptoKey,
  };
}

describe('IndexedDbKeyStore', () => {
  beforeEach(() => {
    // Each test gets a fresh in-memory IndexedDB to prevent state leakage.
    (global as unknown as Record<string, unknown>)['indexedDB'] = new IDBFactory();
  });

  describe('#loadKeys', () => {
    it('returns an empty array when no keys have been saved', async () => {
      const store = new IndexedDbKeyStore();
      const keys = await store.loadKeys();
      expect(keys).toEqual([]);
    });
  });

  describe('#saveKey', () => {
    it('persists a key that is returned by loadKeys', async () => {
      const store = new IndexedDbKeyStore();
      const pair = makeFakeKeyPair(1);
      await store.saveKey(pair);
      const keys = await store.loadKeys();
      expect(keys.length).toBe(1);
      expect(keys[0]).toEqual(pair);
    });

    it('persists multiple keys in insertion order', async () => {
      const store = new IndexedDbKeyStore();
      const pair1 = makeFakeKeyPair(1);
      const pair2 = makeFakeKeyPair(2);
      await store.saveKey(pair1);
      await store.saveKey(pair2);
      const keys = await store.loadKeys();
      expect(keys.length).toBe(2);
      expect(keys[0]).toEqual(pair1);
      expect(keys[1]).toEqual(pair2);
    });

    it('keys survive across separate IndexedDbKeyStore instances sharing the same DB', async () => {
      const store1 = new IndexedDbKeyStore();
      const pair = makeFakeKeyPair(1);
      await store1.saveKey(pair);

      // Simulate a page reload: new instance, same underlying DB (global.indexedDB unchanged).
      const store2 = new IndexedDbKeyStore();
      const keys = await store2.loadKeys();
      expect(keys.length).toBe(1);
      expect(keys[0]).toEqual(pair);
    });
  });
});
