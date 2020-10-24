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
import { AdbClient, WebUsbTransport, Stream } from 'wadb';
let transport;
let adbClient;
const connectButton = document.querySelector('#connect');
const disconnectButton = document.querySelector('#disconnect');
const startButton = document.querySelector('#start');
const stopButton = document.querySelector('#stop');
const screenshotButton = document.querySelector('#screencapture');
const video = document.querySelector('#video');
const screenshot = document.querySelector('#screenshot');
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
        startButton.removeAttribute('disabled');
        screenshotButton.removeAttribute('disabled');
        stopButton.removeAttribute('disabled');
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
        startButton.disabled = true;
        stopButton.disabled = true;
        screenshotButton.disabled = true;
        status.textContent = 'Connect to a device to start';
    }
    catch (e) {
        console.error('Disconnecting Failed: ', e);
    }
}));
const RECORD_FILE_NAME = '/sdcard/webadb-record-2.mp4';
let shell = null;
startButton.addEventListener('click', () => __awaiter(void 0, void 0, void 0, function* () {
    shell = yield Stream.open(adbClient, `shell:screenrecord ${RECORD_FILE_NAME}`, options);
    status.textContent = 'Recording...';
    stopButton.classList.toggle('hidden');
    startButton.classList.toggle('hidden');
}));
stopButton.addEventListener('click', () => __awaiter(void 0, void 0, void 0, function* () {
    // await shell!.write(String.fromCharCode(3) + '\n'); // CTRL+C
    status.textContent = 'Finishing Recording...';
    yield shell.close();
    status.textContent = 'Pulling video...';
    // Trying to load the file straight away results in a broken file.
    // Waiting for a couple of seconds fixes it. Maybe send STAT before
    // attempting download.
    setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
        console.log('Starting ADB Pull');
        const result = yield adbClient.pull(RECORD_FILE_NAME);
        const videoSrc = window.URL.createObjectURL(result);
        video.src = videoSrc;
        download.href = videoSrc;
        download.download = 'recording.mp4';
        stopButton.classList.toggle('hidden');
        startButton.classList.toggle('hidden');
        screenshot.classList.add('hidden');
        video.classList.remove('hidden');
        download.classList.remove('hidden');
        status.textContent = 'Done! Connected and ready';
    }), 2000);
}));
screenshotButton.addEventListener('click', () => __awaiter(void 0, void 0, void 0, function* () {
    status.textContent = 'Generating Screenshot...';
    yield adbClient.shell('screencap -p /sdcard/screenshot.png');
    status.textContent = 'Pulling image...';
    setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
        console.log('Starting ADB Pull');
        const result = yield adbClient.pull('/sdcard/screenshot.png');
        const imageSrc = window.URL.createObjectURL(result);
        screenshot.src = imageSrc;
        download.href = imageSrc;
        download.download = 'screenshot.png';
        download.classList.remove('hidden');
        screenshot.classList.remove('hidden');
        video.classList.add('hidden');
        status.textContent = 'Done! Connected and ready';
    }), 2000);
}));
//# sourceMappingURL=screenrecord.js.map