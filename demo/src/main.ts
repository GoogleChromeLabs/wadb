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

import {AdbClient, WebUsbTransport, Options, KeyStore, Stream} from 'wadb';

let transport: WebUsbTransport | null;
let adbClient: AdbClient | null;

const connectButton = document.querySelector('#connect')!;
const disconnectButton = document.querySelector('#disconnect')!;
const startButton = document.querySelector('#start')!;
const stopButton = document.querySelector('#stop')!;
const screenshotButton = document.querySelector('#screencapture')!;
const video: HTMLVideoElement = (document.querySelector('#video') as HTMLVideoElement)!;
const screenshot = (document.querySelector('#screenshot') as HTMLImageElement)!;
const download = (document.querySelector('#download') as HTMLAnchorElement)!;
const status = document.querySelector('#status')!;

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
    transport = await WebUsbTransport.open(options);
    adbClient = new AdbClient(transport, options, keyStore);

    status.textContent = 'Accept prompt on device';
    const adbConnectionInformation = await adbClient.connect();
    status.textContent = 'Connected and ready';
    console.log('Connected: ', adbConnectionInformation);

    connectButton.classList.toggle('hidden');
    disconnectButton.classList.toggle('hidden');
  } catch(e) {
    console.error('Connection Failed: ', e);
    status.textContent = 'Failed to connect to a device';
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
    connectButton.classList.toggle('hidden');
    disconnectButton.classList.toggle('hidden');
    status.textContent = 'Connect to a device to start';
  } catch(e) {
    console.error('Disconnecting Failed: ', e);
  }
});

const RECORD_FILE_NAME = '/sdcard/webadb-record-2.mp4';

let shell: Stream | null = null;
startButton.addEventListener('click', async() => {
  shell = await Stream.open(adbClient!, `shell:screenrecord ${RECORD_FILE_NAME}`, options);
  status.textContent = 'Recording...';
  stopButton.classList.toggle('hidden');
  startButton.classList.toggle('hidden');
});

stopButton.addEventListener('click', async() => {
  // await shell!.write(String.fromCharCode(3) + '\n'); // CTRL+C
  status.textContent = 'Finishing Recording...';
  await shell!.close();
  status.textContent = 'Pulling video...';
  // Trying to load the file straight away results in a broken file.
  // Waiting for a couple of seconds fixes it. Maybe send STAT before
  // attempting download.
  setTimeout(async () => {
    console.log('Starting ADB Pull');
    const result = await adbClient!.pull(RECORD_FILE_NAME);
    const videoSrc = window.URL.createObjectURL(result);
    video!.src = videoSrc;
    download!.href = videoSrc;
    download.download = 'recording.mp4';
    stopButton.classList.toggle('hidden');
    startButton.classList.toggle('hidden');
    screenshot.classList.add('hidden');
    video.classList.remove('hidden');
    download.classList.remove('hidden');
    status.textContent = 'Done! Connected and ready';
  }, 2000);
});

screenshotButton.addEventListener('click', async() => {
  status.textContent = 'Generating Screenshot...';
  await adbClient!.shell('screencap -p /sdcard/screenshot.png');
  status.textContent = 'Pulling image...';
  setTimeout(async () => {
    console.log('Starting ADB Pull');
    const result = await adbClient!.pull('/sdcard/screenshot.png');
    const imageSrc = window.URL.createObjectURL(result);
    screenshot.src = imageSrc;
    download.href = imageSrc;
    download.download = 'screenshot.png';
    download.classList.remove('hidden');
    screenshot.classList.remove('hidden');
    video.classList.add('hidden');
    status.textContent = 'Done! Connected and ready';
  }, 2000);
});
