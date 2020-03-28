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

import Transport from './Transport';
import {Options} from './Options';
import {Message, MessageHeader} from './Message';
import {KeyStore} from './KeyStore';
import {privateKeyDump} from './Helpers';
import AdbConnectionInformation from './AdbConnectionInformation';
import Stream from './Stream';
import Shell from './Shell';

const VERSION = 0x01000000;
const VERSION_NO_CHECKSUM = 0x01000001;
const MAX_PAYLOAD = 256 * 1024;

const MACHINE_BANNER: string = 'host::\0';

export default class AdbClient {
  /**
   * Creates a new AdbClient
   *
   * @param {Transport} transport the transport layer.
   */
  constructor(
    readonly transport: Transport,
    readonly options: Options,
    readonly keyStore: KeyStore,) {

  }

  async connect(): Promise<AdbConnectionInformation> {
    const version = this.options.useChecksum ? VERSION : VERSION_NO_CHECKSUM;
    const cnxn = Message.cnxn(version, MAX_PAYLOAD, MACHINE_BANNER, this.options.useChecksum);
    await this.sendMessage(cnxn); // Send the Message

    // Response to connect must be CNXN or AUTH. Ignore different responses until the right one
    // arrives.
    let response;
    do {
      console.log('reading response');
      response = await this.receiveMessage();
      console.log(response);
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

  async disconnect() {
    throw new Error('Not Implemented Yet');
  }

  async shell(command: string): Promise<string> {
    const stream = await Stream.open(this, `shell:${command}`, this.options);
    const response = await stream.read();
    await stream.close();
    return response.dataAsString() || '';
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

    const token = authResponse.data.buffer;

    // Try signing with one of the stored keys
    const keys = await this.keyStore.loadKeys();
    for (const key of keys) {
      const signed = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, token);
      const signatureMessage =
          Message.authSignature(new DataView(signed), this.options.useChecksum);
      await this.sendMessage(signatureMessage);
      const signatureResponse = await this.receiveMessage();
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
    console.log('Accept Key on Device');
    const keyResponse = await this.receiveMessage()
    if (keyResponse.header.cmd !== 'CNXN') {
      console.error('AUTH failed. Phone didn\'t accept key', keyResponse);
      throw new Error('AUTH failed. Phone didn\'t accept key');
    }

    return keyResponse;
  }

  public async receiveMessageHeader(): Promise<MessageHeader> {
    const response = await this.transport.receive(24);
    return MessageHeader.parse(response, this.options.useChecksum);
  }

  public async receiveRaw(byteLength: number): Promise<DataView> {
    return await this.transport.receive(byteLength);
  }

  public async sendRaw(dataView: DataView) {
    await this.transport.send(dataView.buffer);
  }

  public async receiveMessage(): Promise<Message> {
    const header = await this.receiveMessageHeader();
    // console.log('Received header:', header);
    let receivedData;
    switch (header.cmd) {
      default: {
        if (header.length > 0) {
          receivedData = await this.transport.receive(header.length);
        }
      }
    }
    const message = new Message(header, receivedData);
    // console.log('Received Message: ', message);
    return message;
  }

  public async sendMessage(m: Message) {
    // console.log('Sending Message', m);
    const data = m.header.toDataView();
    await this.transport.send(data.buffer);
    if (m.data) {
      await this.transport.send(m.data.buffer);
    }
  }

  private async sendData(data: DataView) {
    await this.transport.send(data.buffer);
  }

  static async generateKey(dump: boolean, keySize: number): Promise<CryptoKeyPair> {
    const extractable = dump;
    const key = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: keySize,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: { name: 'SHA-1' }
    }, extractable, [ 'sign', 'verify' ])

    if (dump) {
      await privateKeyDump(key);
    }

    return key;
  }
}
