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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { WebUsbTransport, AdbClient, Stream } from 'wadb';
let transport;
let adbClient;
const connectButton = document.querySelector('#connect');
const disconnectButton = document.querySelector('#disconnect');
const startButton = document.querySelector('#start');
const stopButton = document.querySelector('#stop');
const video = document.querySelector('#video');
const download = document.querySelector('#download');
const status = document.querySelector('#status');
const options = {
    debug: true,
    useChecksum: false,
    dump: false,
    keySize: 2048,
};
class MyKeyStore {
    constructor() {
        this.keys = [];
    }
    loadKeys() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.keys;
        });
    }
    saveKey(key) {
        return __awaiter(this, void 0, void 0, function* () {
            this.keys.push(key);
            console.log('Saving Key' + key);
        });
    }
}
const keyStore = new MyKeyStore();
connectButton.addEventListener('click', (_) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        transport = yield WebUsbTransport.open(options);
        adbClient = new AdbClient(transport, options, keyStore);
        status.textContent = 'Accept prompt on device';
        const adbConnectionInformation = yield adbClient.connect();
        status.textContent = 'Connected and ready';
        console.log('Connected: ', adbConnectionInformation);
        connectButton.classList.toggle('hidden');
        disconnectButton.classList.toggle('hidden');
    }
    catch (e) {
        console.error('Connection Failed: ', e);
        status.textContent = 'Failed to connect to a device';
    }
}));
disconnectButton.addEventListener('click', (_) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (adbClient) {
            try {
                yield adbClient.disconnect();
            }
            catch (e) {
                console.log('Error disconnecting ADB Client: ', e);
            }
            adbClient = null;
        }
        if (transport) {
            yield transport.close();
            transport = null;
        }
        connectButton.classList.toggle('hidden');
        disconnectButton.classList.toggle('hidden');
        status.textContent = 'Connect to a device to start';
    }
    catch (e) {
        console.error('Disconnecting Failed: ', e);
    }
}));
let shell = null;
startButton.addEventListener('click', () => __awaiter(void 0, void 0, void 0, function* () {
    // const mediaSource = new MediaSource();
    // const url = URL.createObjectURL(mediaSource);
    // video.src = url;
    status.textContent = 'Recording...';
    stopButton.classList.toggle('hidden');
    startButton.classList.toggle('hidden');
    const textDecoder = new TextDecoder();
    // mediaSource.addEventListener('sourceopen', async () => {
    shell = yield Stream.open(adbClient, 'exec:screenrecord --output-format=h264 -', options);
    // const audioSourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="mp4a.40.2"');
    const chunks = [];
    let i = 0;
    let msg;
    while (true) {
        console.log(++i);
        msg = yield shell.read();
        yield shell.write('OKAY');
        if (msg.header.cmd === 'CLSE') {
            break;
        }
        console.log(textDecoder.decode(msg.data.buffer));
        chunks.push(new Uint8Array(msg.data.buffer));
    }
    console.log(chunks.length);
    const objectUrl = URL.createObjectURL(new Blob(chunks));
    video.src = objectUrl;
    download.href = objectUrl;
    // });
}));
stopButton.addEventListener('click', () => __awaiter(void 0, void 0, void 0, function* () {
    yield (shell === null || shell === void 0 ? void 0 : shell.write('CLSE'));
}));
//# sourceMappingURL=livestream.js.map