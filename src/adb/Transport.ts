import {getOptions} from './Options';
import { hexdump, privateKeyDump, publicKeyDump, toB64 } from './Helpers';
import AdbDevice from './adb/AdbDevice';
import Message from './Message';
import { KeyStore } from './KeyStore';

const options = getOptions();

const DEVICE_FILTERS = [
  { classCode: 255, subclassCode: 66, protocolCode: 1 },
  { classCode: 255, subclassCode: 66, protocolCode: 3 }
];

export type authUserNotify = (publickKey: CryptoKey) => void;
export interface DeviceMatch {
  conf: USBConfiguration;
  intf: USBInterface;
  alternate: USBAlternateInterface;
}

export default class Transport {
  private device: USBDevice;
  private keyStore: KeyStore;

  constructor(device: USBDevice, keyStore: KeyStore) {
    this.device = device;
    this.keyStore = keyStore;

		if (options.debug) {
      console.log(this);
    }
  }

  close() {
    this.device.close();
  }

  async send(ep: number, data: ArrayBuffer) {
    if (options.dump) {
      hexdump(new DataView(data), '' + ep + '==> ');
    }

    await this.device.transferOut(ep, data);
  }

  async receive(ep: number, len: number): Promise<DataView> {
    const response = await this.device.transferIn(ep, len);
    if (!response.data) {
      throw new Error('Response didn\'t contain any data');
    }
    return response.data;
  }

  find(filter: USBDeviceFilter): DeviceMatch | null {
    for (const configuration of this.device.configurations) {
      for (const intf of configuration.interfaces) {
        for (const alternate of intf.alternates) {
          if (filter.classCode === alternate.interfaceClass &&
              filter.subclassCode === alternate.interfaceSubclass &&
              filter.protocolCode === alternate.interfaceProtocol) {
            return {
              conf: configuration,
              intf,
              alternate
            };
          }
        }
      }
    }
    return null;
  }

	isAdb() {
		const match = this.find({ classCode: 255, subclassCode: 66, protocolCode: 1 });
		return match != null;
	};

	isFastboot(){
		const match = this.find({ classCode: 255, subclassCode: 66, protocolCode: 3 });
		return match != null;
  };

  async connectAdb(banner: string, authUserNotify?: authUserNotify): Promise<AdbDevice> {
    const VERSION = 0x01000000;
		const VERSION_NO_CHECKSUM = 0x01000001;
		const MAX_PAYLOAD = 256 * 1024;

		let keyIdx = 0;
		const AUTH_TOKEN = 1;

		const versionUsed = options.useChecksum ? VERSION : VERSION_NO_CHECKSUM;
    const m = new Message('CNXN', versionUsed, MAX_PAYLOAD, '' + banner + '\0');

    const match = await this.getDevice({ classCode: 255, subclassCode: 66, protocolCode: 1 });

    if (match === null) {
      throw new Error('match is null');
    }

    const adb = new AdbDevice(this, match);
    let response = await m.sendReceive(adb);

    const doAuthResponse = async (response: Message): Promise<Message> => {
      if (response.cmd !== 'AUTH' || response.arg0 !== AUTH_TOKEN) {
        return response;
      }

      const keys = await this.keyStore.loadKeys();
      return await Transport.doAuth(adb, this.keyStore, keyIdx++, response.dataAsDataView().buffer,
          doAuthResponse, authUserNotify);
    };

    response = await doAuthResponse(response);
    if (response.cmd !== 'CNXN') {
      throw new Error('Failed to connect with \'' + banner + '\'');
    }

    console.log('version', response.arg0);
    if (response.arg0 !== VERSION && response.arg0 !== VERSION_NO_CHECKSUM) {
      throw new Error('Version mismatch: ' + response.arg0 + ' (expected: ' + VERSION + ' or ' + VERSION_NO_CHECKSUM + ')');
    }

    if (options.debug) {
      console.log('Connected with \'' + banner + '\', max_payload: ' + response.arg1);
    }

    adb.maxPayload = response.arg1;
    if (response.arg0 === VERSION_NO_CHECKSUM) {
      options.useChecksum = false;
    }

    adb.banner = new TextDecoder('utf-8').decode(response.dataAsDataView());

    const pieces = adb.banner.split(':');
    adb.mode = pieces[0];
    return adb;
  };

  async getDevice(filter: USBDeviceFilter): Promise<DeviceMatch | null> {
    const match = this.find(filter);
    if (!match) {
      return null;
    }
    await this.device.selectConfiguration(match.conf.configurationValue);
    await this.device.claimInterface(match.intf.interfaceNumber);
    await this.device.selectAlternateInterface(
        match.intf.interfaceNumber, match.alternate.alternateSetting);
    return match;
  }

  static async open(keyStore: KeyStore): Promise<Transport> {
    const device = await navigator.usb.requestDevice({filters: DEVICE_FILTERS});
    await device.open();
    return new Transport(device, keyStore);
  }

  static async doAuth(
      adb: AdbDevice,
      keyStore: KeyStore,
      keyIdx: number,
      token: any,
      doAuthResponse: (response: Message) => Promise<Message>,
      authUserNotify?: authUserNotify) {
    const AUTH_SIGNATURE = 2;
    const AUTH_RSAPUBLICKEY = 3;

    const keys = await keyStore.loadKeys();
    if (keyIdx < keys.length) {
      const slot = keys.length - keyIdx - 1;
      const key = keys[slot];

      if (options.debug) {
        console.log('signing with key ' + slot + '...');
      }

      if (options.dump) {
        await privateKeyDump(key);
        await publicKeyDump(key);
        hexdump(new DataView(token));
        console.log(`-----BEGIN TOKEN-----\n${toB64(token)}\n-----END TOKEN-----`);
      }

      const signed = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, token);
      if (options.dump) {
        console.log('-----BEGIN SIGNATURE-----\n' + toB64(signed) + '\n-----END SIGNATURE-----');
      }

      const m = new Message('AUTH', AUTH_SIGNATURE, 0, signed);
      let result = await m.sendReceive(adb);
      result = await doAuthResponse(result);
    }

    let dirty = false;

    let key: CryptoKeyPair | null = null;
    if (options.reuseKey !== false) {
      keyIdx = options.reuseKey === true ? -1 : options.reuseKey;

      if (keyIdx < 0) {
        keyIdx += keys.length;
      }

      if (keyIdx >= 0 && keyIdx < keys.length) {
        if (options.debug) {
          console.log('reusing key ' + keyIdx + '...');
        }
        key = keys[keyIdx];
      }
    }

    if (key === null) {
      if (options.debug) {
        console.log('generating key ' + keyIdx + ' (' + options.keySize + ' bits)...');
      }

      key = await Transport.generateKey();
      dirty = true;
    }

    const pubKey = await crypto.subtle.exportKey('spki', key.publicKey);
    const m = new Message('AUTH', AUTH_RSAPUBLICKEY, 0, toB64(pubKey) + '\0');
    await m.send(adb);
    if (options.debug) {
      console.log('waiting for user confirmation...');
    }

    if (authUserNotify) {
      authUserNotify(key.publicKey);
    }

    const response = await Message.receive(adb);
    if (response.cmd !== 'CNXN') {
      return response;
    }

    if (!dirty) {
      return response;
    }

    await keyStore.saveKey(key);
    return response;
  }

  static async generateKey(): Promise<CryptoKeyPair> {
    const extractable = options.dump;
    const key = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: options.keySize,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: { name: 'SHA-1' }
    }, extractable, [ 'sign', 'verify' ])

    if (options.dump) {
      await privateKeyDump(key);
    }

    return key;
  }
}
