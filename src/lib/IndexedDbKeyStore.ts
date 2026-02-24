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

import {KeyStore} from './KeyStore';

const DB_NAME = 'wadb';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, {autoIncrement: true});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * A KeyStore implementation that persists keys across page reloads using
 * IndexedDB. CryptoKey objects are stored directly, which avoids the need to
 * export and re-import them.
 */
export class IndexedDbKeyStore implements KeyStore {
  async loadKeys(): Promise<CryptoKeyPair[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as CryptoKeyPair[]);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }

  async saveKey(key: CryptoKeyPair): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const request = tx.objectStore(STORE_NAME).add(key);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => { db.close(); resolve(); };
    });
  }
}
