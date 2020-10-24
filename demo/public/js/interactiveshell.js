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
import { AdbClient, WebUsbTransport } from 'wadb';
const connectButton = document.querySelector('#connect');
const disconnectButton = document.querySelector('#disconnect');
const output = document.querySelector('#output');
const input = document.querySelector('#input');
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
const options = {
    debug: true,
    useChecksum: false,
    dump: false,
    keySize: 2048,
};
const keyStore = new MyKeyStore();
let transport = null;
let adbClient = null;
let shell = null;
function appendToCode(text) {
    const span = document.createElement('span');
    span.innerText = text;
    output.appendChild(span);
    output.scrollTop = output.scrollHeight;
}
function sendCommand(cmd) {
    shell.write(cmd + '\n');
}
connectButton.addEventListener('click', (e) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        transport = yield WebUsbTransport.open(options);
        adbClient = new AdbClient(transport, options, keyStore);
        yield adbClient.connect();
        shell = yield adbClient.interactiveShell(appendToCode);
        disconnectButton.classList.toggle('hidden');
        connectButton.classList.toggle('hidden');
    }
    catch (e) {
        console.error('Connection Failed: ', e);
    }
}));
disconnectButton.addEventListener('click', (e) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (shell === null || shell === void 0 ? void 0 : shell.close());
        yield (transport === null || transport === void 0 ? void 0 : transport.close());
        transport = null;
        adbClient = null;
        shell = null;
    }
    catch (e) {
        console.error('Error closing the connection', e);
    }
    disconnectButton.classList.toggle('hidden');
    connectButton.classList.toggle('hidden');
}));
input.addEventListener('keyup', (e) => {
    if (e.keyCode === 13) {
        e.preventDefault();
        sendCommand(input.value);
        input.value = '';
        return false;
    }
    return true;
});
//# sourceMappingURL=interactiveshell.js.map