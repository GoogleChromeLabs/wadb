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

function paddit(text: string, width: number, padding: string): string {
  const padlen = width - text.length;
  let padded = '';

  for (let i = 0; i < padlen; i++) {
      padded += padding;
    }

  return padded + text;
}

export function toHex8(num: number): string {
  return paddit(num.toString(16), 2, '0');
}

export function toHex16(num: number): string {
  return paddit(num.toString(16), 4, '0');
}

export function toHex32(num: number): string {
  return paddit(num.toString(16), 8, '0');
}

export function hexdump(view: DataView, prefix = ''): void {
  const decoder = new TextDecoder();
  for (let i = 0; i < view.byteLength; i += 16) {
    const max = (view.byteLength - i) > 16 ? 16 : (view.byteLength - i);
    let row = prefix + toHex16(i) + ' ';
    let j;

    for (j = 0; j < max; j++) {
      row += ' ' + toHex8(view.getUint8(i + j));
    }

    for (; j < 16; j++){
      row += '   ';
    }

    row += ' | ' + decoder.decode(new DataView(view.buffer, i, max));
    console.log(row);
  }
}

export function toB64(buffer: ArrayBuffer): string {
  return btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''));
}

export async function privateKeyDump(key: CryptoKeyPair): Promise<void> {
  if (!key.privateKey.extractable) {
    console.log('cannot dump the private key, it\'s not extractable');
    return;
  }

  const privkey = await crypto.subtle.exportKey('pkcs8', key.privateKey);
  console.log(`-----BEGIN PRIVATE KEY-----\n${toB64(privkey)}\n-----END PRIVATE KEY-----`);
}

export async function publicKeyDump(key: CryptoKeyPair): Promise<void> {
  if (!key.publicKey.extractable) {
    console.log('cannot dump the public key, it\'s not extractable');
    return;
  }

  const pubKey = await crypto.subtle.exportKey('spki', key.publicKey);
  console.log(`-----BEGIN PUBLIC KEY-----\n${toB64(pubKey)}'\n-----END PUBLIC KEY-----`);
}

export function encodeCmd(cmd: string): number {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(cmd).buffer;
  const view = new DataView(buffer);
  return view.getUint32(0, true);
}

export function decodeCmd(cmd: number): string {
  const decoder = new TextDecoder();
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, cmd, true);
  return decoder.decode(buffer);
}
