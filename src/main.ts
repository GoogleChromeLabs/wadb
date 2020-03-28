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
import Stream from './lib/Stream';

let transport: Transport | null;
let adbClient: AdbClient | null;

const connectButton = document.querySelector('#connect')!;
const disconnectButton = document.querySelector('#disconnect')!;
const startButton = document.querySelector('#start')!;
const stopButton = document.querySelector('#stop')!;
const video: HTMLVideoElement | null = document.querySelector('#video');
const download: HTMLAnchorElement | null = document.querySelector('#download');
const pullButton = document.querySelector('#pull');

const options: Options = {
  debug: true,
  useChecksum: false,
  dump: false,
  keySize: 2048,
};

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

const keyStore = new MyKeyStore();

connectButton.addEventListener('click', async (_) => {
  try {
    transport = await Transport.open(options);
    adbClient = new AdbClient(transport, options, keyStore);

    const adbConnectionInformation = await adbClient.connect();
    console.log('Connected: ', adbConnectionInformation);

    disconnectButton.removeAttribute('disabled');
    startButton.removeAttribute('disabled');
    connectButton.setAttribute('disabled', '');

    console.log(adbClient);
  } catch(e) {
    console.error('Connection Failed: ', e);
  }
});

disconnectButton.addEventListener('click', async (_) => {
  try {
    if (adbClient) {
      try {
        await adbClient.disconnect();
      } catch (e) {
        console.log('Error disconnecting ADB Client: ', e);
      }
      adbClient = null;
    }
    if (transport) {
      await transport.close();
      transport = null;
    }
    disconnectButton.setAttribute('disabled', '');
    startButton.setAttribute('disabled', '');
    connectButton.removeAttribute('disabled');

  } catch(e) {
    console.error('Disconnecting Failed: ', e);
  }
});

const RECORD_FILE_NAME = '/sdcard/webadb-record-2.mp4';

let shell: Stream | null = null;
startButton.addEventListener('click', async() => {
  shell = await Stream.open(adbClient!, `shell:screenrecord ${RECORD_FILE_NAME}`, options);
  startButton.setAttribute('disabled', '');
  stopButton.removeAttribute('disabled');
});

stopButton.addEventListener('click', async() => {
  // await shell!.write(String.fromCharCode(3) + '\n'); // CTRL+C
  await shell!.close();
  const message = await shell!.read();
  // expect CLSE?
  console.log(message);
  await shell!.write('OKAY');

  // Trying to load the file straight away results in a broken file.
  // Waiting for a couple of seconds fixes it. Maybe send STAT before
  // attempting download.
  setTimeout(async () => {
    console.log('Starting ADB Pull');
    const result = await adbClient!.pull(RECORD_FILE_NAME);
    const videoSrc = window.URL.createObjectURL(result);
    console.log(result);
    console.log('video: ', videoSrc);
    video!.src = videoSrc;
    download!.href = videoSrc;
    stopButton.setAttribute('disabled', '');
    startButton.removeAttribute('disabled');
  }, 2000);
});

pullButton?.addEventListener('click', async() => {
  const result = await adbClient!.pull(RECORD_FILE_NAME);
  const videoSrc = window.URL.createObjectURL(result);
  console.log(result);
  console.log('video: ', videoSrc);
  video!.src = videoSrc;
  download!.href = videoSrc;
});
