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

import Transport from './lib/Transport';
import AdbClient from './lib/AdbClient';
import {Options} from './lib/Options';
import {KeyStore} from './lib/KeyStore';
import Shell from './lib/Shell';

const connectButton = document.querySelector('#connect')!;
const disconnectButton = document.querySelector('#disconnect')!;
const output = document.querySelector('#output')!;
const input: HTMLInputElement = document.querySelector('#input')! as HTMLInputElement;

class MyKeyStore implements KeyStore {
  private keys: CryptoKeyPair[] = [];
  async loadKeys(): Promise<CryptoKeyPair[]> {
    return this.keys;
  }

  async saveKey(key: CryptoKeyPair): Promise<void> {
    this.keys.push(key);
    console.log('Saving Key' + key);
  }
}

const options: Options = {
  debug: true,
  useChecksum: false,
  dump: false,
  keySize: 2048,
};

const keyStore = new MyKeyStore();

let transport: Transport | null = null;
let adbClient: AdbClient | null = null;
let shell: Shell | null = null;

function appendToCode(text: string) {
  const span = document.createElement('span');
  span.innerText = text;
  output.appendChild(span);
}

connectButton.addEventListener('click', async () => {
  try {
    transport = await Transport.open(options);
    adbClient = new AdbClient(transport, options, keyStore);
    await adbClient.connect();
    shell = await adbClient.interactiveShell(appendToCode);

    disconnectButton.removeAttribute('disabled');
    connectButton.setAttribute('disabled', '');
  } catch(e) {
    console.error('Connection Failed: ', e);
  }
});

disconnectButton.addEventListener('click', async () => {
  try {
    await transport?.close();
    transport = null;
    adbClient = null;
    shell = null;
  } catch (e) {
    console.error('Error closing the connection', e);
  }
  disconnectButton.setAttribute('disabled', '');
  connectButton.removeAttribute('disabled');
});

input.addEventListener('keyup', async (e) => {
  if (e.keyCode === 13) {
    shell?.write(input.value);
    input.value = '';
  }
});
