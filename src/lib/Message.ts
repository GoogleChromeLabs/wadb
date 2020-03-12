import Device from './Device';
import {encodeCmd, decodeCmd} from './Helpers';
import {Options, DEFAULT_OPTIONS} from './Options';
import AdbDevice from './adb/AdbDevice';

const options: Options = DEFAULT_OPTIONS;

export type MessagePayload = string | BufferSource | DataView | null;

export default class Message {
  readonly length: number;
  constructor(
      readonly cmd: string,
      readonly arg0: number,
      readonly arg1: number,
      readonly data?: MessagePayload) {
    this.length = (!data) ? 0 : (typeof data === 'string') ? data.length : data.byteLength;
  }

  async send(device: Device): Promise<void> {
    return await Message.send(device, this);
  }

  async sendReceive(device: AdbDevice): Promise<Message> {
    await this.send(device);
    return await Message.receive(device);
  }

  dataAsString(): string | null {
    if (!this.data) {
      return null;
    }

    if (typeof this.data === 'string') {
      return this.data;
    }

    const decoder = new TextDecoder();
    return decoder.decode(this.data);
  }

  dataAsDataView(): DataView {
    if (!this.data) {
      throw new Error('data is null');
    }

    if (!(this.data instanceof DataView)) {
      throw new Error('data is not a DataView');
    }

    return this.data;
  }

  static checksum(dataView: DataView): number {
    let sum = 0;
		for (let i = 0; i < dataView.byteLength; i++) {
      sum += dataView.getUint8(i);
    }
		return sum & 0xffffffff;
  }

  static async send(device: Device, message: Message): Promise<void> {
    if(options.debug) {
      console.log('Sending Message: ', message);
    }
    const header = new ArrayBuffer(24);
    const cmd = encodeCmd(message.cmd);
    const magic = cmd ^ 0xffffffff;
    let data = null;
    let len = 0;
    let checksum = 0;
    if (message.data != null) {
			if (typeof message.data === 'string') {
				const encoder = new TextEncoder();
				data = encoder.encode(message.data).buffer;
			} else if (ArrayBuffer.isView(message.data)) {
				data = message.data.buffer;
			} else {
				data = message.data;
			}

			len = data.byteLength;
			if (options.useChecksum) {
        checksum = Message.checksum(new DataView(data));
      }

      if (len > device.maxPayload) {
        throw new Error(`data is too big: ${len} bytes (max: ${device.maxPayload} bytes)`);
      }
    }

    const view = new DataView(header);
		view.setUint32(0, cmd, true);
		view.setUint32(4, message.arg0, true);
		view.setUint32(8, message.arg1, true);
		view.setUint32(12, len, true);
		view.setUint32(16, checksum, true);
		view.setUint32(20, magic, true);

    await device.send(header);
		if (len > 0 && data !== null) {
      await device.send(data);
    }
  }

  static async receive(device: AdbDevice): Promise<Message> {
    const response = await device.receive(24); // options.useChecksum ? 24 : 20)
    const cmd = response.getUint32(0, true);
    const arg0 = response.getUint32(4, true);
    const arg1 = response.getUint32(8, true);
    const len = response.getUint32(12, true);
    const check = response.getUint32(16, true);

     // Android seems to have stopped providing checksums
    if (options.useChecksum && response.byteLength > 20) {
      const magic = response.getUint32(20, true);

      if ((cmd ^ magic) !== -1) {
        throw new Error('magic mismatch');
      }
    }

    const decodedCmd = decodeCmd(cmd);
    if (len === 0) {
      const message = new Message(decodedCmd, arg0, arg1);
      if (options.debug) {
        console.log('Received Message: ', message);
      }
      return message;
    }

    const data = await device.receive(len);

    if (options.useChecksum && Message.checksum(data) !== check) {
      throw new Error('checksum mismatch');
    }

    const message = new Message(decodedCmd, arg0, arg1, data);
    if (options.debug) {
      console.log('Received Message: ', message);
    }
    return message;
  }
}
