import Connection from '../Connection.js';
import {authUserVerify} from '../Connection.js';

const ADB_DEVICE_FILTER: USBDeviceFilter = {
  classCode: 255,
  subclassCode: 66,
  protocolCode: 1,
};

const VERSION = 0x01000000;
const VERSION_NO_CHECKSUM = 0x01000001;
const MAX_PAYLOAD = 256 * 1024;
const AUTH_TOKEN = 1;


export default class AdbConnection extends Connection {
  keyIndex = 1;

  async connect(banner: string, authUserVerify: authUserVerify | null = null): Promise<void> {
    // const version_used = Adb.Opt.use_checksum ? VERSION : VERSION_NO_CHECKSUM;
    // const m = new Adb.Message("CNXN", version_used, MAX_PAYLOAD, "" + banner + "\0");
    // const match = await this.getDevice(ADB_DEVICE_FILTER);
    // const device = new Adb.WebUSB.Device(this, match);
    // await m.sendReceive(device);
    throw new Error("Method not implemented.");
  }

  static async open() {
    const device = await navigator.usb.requestDevice({filters: [ADB_DEVICE_FILTER]});
    return new AdbConnection(device);
  }
}
