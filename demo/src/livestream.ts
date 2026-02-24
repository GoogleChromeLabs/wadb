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

import {WebUsbTransport, AdbClient, Options, KeyStore, Stream} from 'wadb';

let transport: WebUsbTransport | null;
let adbClient: AdbClient | null;

const connectButton = document.querySelector('#connect')!;
const disconnectButton = document.querySelector('#disconnect')!;
const startButton = document.querySelector('#start')!;
const stopButton = document.querySelector('#stop')!;
const video: HTMLVideoElement = (document.querySelector('#video') as HTMLVideoElement)!;
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

connectButton.addEventListener('click', async (_event) => {
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

disconnectButton.addEventListener('click', async (_event) => {
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

let shell: Stream | null = null;
startButton.addEventListener('click', async() => {
  // const mediaSource = new MediaSource();
  // const url = URL.createObjectURL(mediaSource);
  // video.src = url;

  status.textContent = 'Recording...';
  stopButton.classList.toggle('hidden');
  startButton.classList.toggle('hidden');

  const textDecoder = new TextDecoder();
  // mediaSource.addEventListener('sourceopen', async () => {
    shell = await Stream.open(adbClient!, 'exec:screenrecord --output-format=h264 -', options);
    // const audioSourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="mp4a.40.2"');
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let i = 0;

    let msg;
    while (true) {
      console.log(++i);
      msg = await shell!.read();
      await shell!.write('OKAY');
      if (msg.header.cmd === 'CLSE') {
        break;
      }
      console.log(textDecoder.decode(msg.data!.buffer));
      chunks.push(new Uint8Array(msg.data!.buffer as ArrayBuffer));
    }
    console.log(chunks.length);
    const objectUrl = URL.createObjectURL(new Blob(chunks));
    video.src = objectUrl;
    download.href = objectUrl;
  // });
});

stopButton.addEventListener('click', async() => {
  await shell?.write('CLSE');
});
