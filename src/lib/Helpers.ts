import Message, { MessagePayload } from './Message';
import SyncFrame from './SyncFrame';
import { getOptions } from './Options';

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

export function toHex8(num: number) {
  return paddit(num.toString(16), 2, '0');
}

export function toHex16(num: number) {
  return paddit(num.toString(16), 4, '0');
}

export function toHex32(num: number) {
  return paddit(num.toString(16), 8, '0');
}

export function hexdump(view: DataView, prefix: string = '') {
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

export function checkOk(response: Message | SyncFrame, errorMessage: string): void {
  return checkCmd(response, 'OKAY', errorMessage);
}

export function checkCmd(
      response: Message | SyncFrame, expectedCmd: string, errorMessage: string): void {
  if (response.cmd === 'FAIL') {
    errorMessage = dataAsString(response.data);
    throw new Error(errorMessage);
  }

  if (response.cmd !== expectedCmd) {
    throw new Error(errorMessage);
  }
}

export function getEndpointNum(
      endpoints: USBEndpoint[], dir: 'in' | 'out', type: string = 'bulk'): number {
  for(const ep of endpoints) {
    if (ep.direction === dir && ep.type === type) {
      return ep.endpointNumber;
    }
  }

  if (getOptions().debug) {
    console.log(endpoints);
  }

  throw new Error(`Cannot find ${dir} endpoint`);
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

export function toB64(buffer: ArrayBuffer) {
  return btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''));
}

function dataAsString(data?: MessagePayload): string {
  if (!data) {
    return '<No data>';
  }

  if (typeof data === 'string') {
    return data;
  }

  const decoder = new TextDecoder();
  return decoder.decode(data);
}

function paddit(text: string, width: number, padding: string) {
  const padlen = width - text.length;
  let padded = '';

  for (let i = 0; i < padlen; i++)
      padded += padding;

  return padded + text;
}
