import Connection from '../Connection.js';
import {authUserVerify} from '../Connection.js';

const FASTBOOT_DEVICE_FILTER: USBDeviceFilter[] = [{
  classCode: 255,
  subclassCode: 66,
  protocolCode: 3,
}];

export default class FastbootConnection extends Connection {
  async connect(banner: string, authUserVerify: authUserVerify | null = null): Promise<void> {
    throw new Error("Method not implemented.");
  }

  static async open() {
    const device = await navigator.usb.requestDevice({filters: FASTBOOT_DEVICE_FILTER});
    return new FastbootConnection(device);
  }
}