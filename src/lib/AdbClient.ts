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

import {Transport} from './transport/Transport';
import {Options} from './Options';
import {Message, MessageChannel, MessageListener} from './message';
import {KeyStore} from './KeyStore';
import {AdbConnectionInformation} from './AdbConnectionInformation';
import {Stream} from './Stream';
import {Shell} from './Shell';
import {AsyncBlockingQueue} from './Queues';
import {Framebuffer} from './Framebuffer';

const VERSION = 0x01000000;
const VERSION_NO_CHECKSUM = 0x01000001;
const MAX_PAYLOAD = 256 * 1024;
const DEFAULT_MAX_SHELL_OUTPUT = 8 * 1024 * 1024;

const MACHINE_BANNER = 'host::\0';

// Cap on unmatched device messages retained in messageQueue. A rogue or buggy
// device that streams frames not addressed to any open Stream should not be
// able to grow the renderer heap without bound.
const MAX_PENDING_MESSAGES = 256;

export interface ShellOptions {
  maxOutputSize?: number;
}

export class AdbClient implements MessageListener {
  private messageChannel: MessageChannel;
  private messageQueue = new AsyncBlockingQueue<Message>(MAX_PENDING_MESSAGES);
  private openStreams: Set<Stream> = new Set();

  /**
   * Creates a new AdbClient
   *
   * @param {Transport} transport the transport layer.
   */
  constructor(
    readonly transport: Transport,
    readonly options: Options,
    readonly keyStore: KeyStore,) {
      this.messageChannel = new MessageChannel(transport, options, this);
  }

  registerStream(stream: Stream): void {
    this.openStreams.add(stream);
  }

  unregisterStream(stream: Stream): void {
    this.openStreams.delete(stream);
  }

  newMessage(msg: Message): void {
    // Check if this message matches one of the open streams.
    const streams = Array.from(this.openStreams);
    for (const stream of streams) {
      if (stream.consumeMessage(msg)) {
        return;
      }
    }
    if (!this.messageQueue.enqueue(msg)) {
      // Nothing is draining the queue; drop rather than retain unbounded state.
      if (this.options.debug) {
        console.warn('AdbClient: dropping unmatched device message; queue full');
      }
    }
  }

  public async awaitMessage(): Promise<Message> {
    return this.messageQueue.dequeue();
  }

  async connect(): Promise<AdbConnectionInformation> {
    const version = this.options.useChecksum ? VERSION : VERSION_NO_CHECKSUM;
    const cnxn = Message.cnxn(version, MAX_PAYLOAD, MACHINE_BANNER, this.options.useChecksum);
    await this.sendMessage(cnxn); // Send the Message

    // Response to connect must be CNXN or AUTH. Ignore different responses until the right one
    // arrives.
    let response;
    do {
      response = await this.awaitMessage();
    } while (response.header.cmd !== 'CNXN' && response.header.cmd !== 'AUTH');

    // Server connected
    if (response.header.cmd === 'CNXN') {
      if (!response.data) {
        throw new Error('Connection doesn\'t have data');
      }
      return AdbConnectionInformation.fromDataView(response.data);
    }

    // Server asked to authenticate
    response = await this.doAuth(response);
    if (!response.data) {
      throw new Error('Connection doesn\'t have data');
    }
    return AdbConnectionInformation.fromDataView(response.data);
  }

  async disconnect(): Promise<void> {
    this.messageChannel.close();
  }

  async shell(command: string, shellOptions?: ShellOptions | number): Promise<string> {
    const maxOutput = typeof shellOptions === 'number' ?
        shellOptions :
        (shellOptions?.maxOutputSize ?? this.options.maxShellOutput ?? DEFAULT_MAX_SHELL_OUTPUT);

    const stream = await Stream.open(this, `shell:${command}`, this.options);
    const okayMessage = Message.newMessage('OKAY', stream.localId, stream.remoteId, this.options.useChecksum);
    const chunks: string[] = [];
    let totalBytes = 0;
    let message: Message;

    try {
      do {
        message = await stream.read();
        if (message.header.cmd === 'WRTE') {
          await this.sendMessage(okayMessage);
          const dataLength = message.data?.byteLength ?? 0;
          totalBytes += dataLength;
          if (totalBytes > maxOutput) {
            try {
              await stream.close();
            } catch {
              // Best-effort close; proceed to throw the abort error.
            }
            throw new Error(
                `Shell command '${command}' output exceeded maximum allowed limit of ${maxOutput} bytes. ` +
                'To increase this limit, specify \'maxOutputSize\' in shell options or \'maxShellOutput\' in AdbClient options.');
          }
          chunks.push(message.dataAsString() || '');
        }
      } while (message.header.cmd !== 'CLSE');
    } finally {
      stream.client.unregisterStream(stream);
    }

    return chunks.join('');
  }

  async framebuffer(): Promise<Framebuffer> {
    return Framebuffer.create(this, this.options);
  }

  async interactiveShell(callback?: (result: string) => void): Promise<Shell> {
    const stream = await Stream.open(this, 'shell:', this.options);
    return new Shell(stream, callback);
  }

  async sync(): Promise<Stream> {
    return await Stream.open(this, 'sync:', this.options);
  }

  async pull(filename: string): Promise<Blob> {
    const syncStream = await this.sync();
    const result = await syncStream.pull(filename);
    await syncStream.close();
    return result;
  }

  /**
   * Pushes a blob of data to the device at the specified remote path.
   *
   * @param {Blob} blob The data to push.
   * @param {string} remotePath The path on the device to write the data to.
   * @param {string} mode The mode to set on the file (e.g., "0755").
   * @param {number} chunkSize The size of data chunks to send at a time.
   */
  async push(blob: Blob, remotePath: string, mode: string, chunkSize: number):
      Promise<void> {
    const syncStream = await this.sync();
    await syncStream.push(blob, remotePath, mode, chunkSize);
    await syncStream.close();
  }

  private async doAuth(authResponse: Message): Promise<Message> {
    if (authResponse.header.cmd !== 'AUTH') {
      throw new Error('Not an AUTH response');
    }

    if (authResponse.header.arg0 !== 1) {
      throw new Error(`
          Invalid AUTH parameter. Expected 1 and received ${authResponse.header.arg0}`);
    }

    if (!authResponse.data) {
      throw new Error('AUTH message doens\'t contain data');
    }

    if (authResponse.data.byteLength !== 20) {
      throw new Error(
          `Invalid AUTH token length. Expected 20 bytes and received ${authResponse.data.byteLength}`);
    }

    const token = new Uint8Array(
        authResponse.data.buffer as ArrayBuffer,
        authResponse.data.byteOffset,
        authResponse.data.byteLength);

    // Try signing with the most recently stored key only. Attempting every
    // stored key would let a device that keeps rejecting signatures harvest a
    // valid signature over its chosen token from every private key we hold.
    const keys = await this.keyStore.loadKeys();
    if (keys.length > 0) {
      const key = keys[keys.length - 1];
      const signed = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, token);
      const signatureMessage =
          Message.authSignature(new DataView(signed), this.options.useChecksum);
      await this.sendMessage(signatureMessage);
      const signatureResponse = await this.awaitMessage();
      if (signatureResponse.header.cmd === 'CNXN') {
        return signatureResponse;
      }
      console.log('Received message ', signatureResponse, 'from phone');
    }

    // None of they saved Keys is usable. Create new key
    const key = await AdbClient.generateKey(this.options.dump, this.options.keySize);
    await this.keyStore.saveKey(key);
    const exportedKey = new DataView(await crypto.subtle.exportKey('spki', key.publicKey));
    const keyMessage = Message.authPublicKey(exportedKey, this.options.useChecksum);
    await this.sendMessage(keyMessage);

    if (this.options.debug) {
      console.log('Waiting for key to be accepted on the device.');
    }
    const keyResponse = await this.awaitMessage()
    if (keyResponse.header.cmd !== 'CNXN') {
      console.error('AUTH failed. Phone didn\'t accept key', keyResponse);
      throw new Error('AUTH failed. Phone didn\'t accept key');
    }
    return keyResponse;
  }

  public async sendMessage(m: Message): Promise<void> {
    await this.messageChannel.write(m);
  }

  static async generateKey(dump: boolean, keySize: number): Promise<CryptoKeyPair> {
    // The persisted ADB host private key must never be extractable, and must
    // never be logged. `Options.dump` controls USB wire hexdumps only and must
    // not influence key extractability.
    const key = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: keySize,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: { name: 'SHA-1' }
    }, false, [ 'sign', 'verify' ]);

    return key;
  }
}
