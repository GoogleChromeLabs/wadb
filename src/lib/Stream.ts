import Device from './Device';
import Message from './Message';
import SyncFrame from './SyncFrame';
import {Options, DEFAULT_OPTIONS} from './Options';
import {toHex32, decodeCmd, checkCmd, checkOk} from './Helpers';
import AdbDevice from './adb/AdbDevice';

const options: Options = DEFAULT_OPTIONS;

export type StatResult =  {
  mode: number,
  size: number,
  time: number,
};

export type Mode = 10;

export default class Stream {
  private device: AdbDevice;
  private service: string;
  private localId: number;
  private remoteId: number;
  private cancel: (() => Promise<void>) | null = null;
  private static nextId = 1;

  constructor(device: AdbDevice, service: string, localId: number, remoteId: number) {
    this.device = device;
    this.service = service;
    this.localId = localId;
    this.remoteId = remoteId;
  }

  async close(): Promise<void> {
		if (this.localId !== 0) {
			this.localId = 0;
			return await this.send('CLSE');
		}

		if (options.debug) {
			console.log(`Closed stream ${this.service}`);
			console.log(` local_id: 0x${toHex32(this.localId)}`);
			console.log(` remote_id: 0x${toHex32(this.remoteId)}`);
		}

		this.service = '';
		this.remoteId = 0;
  }

  async send(cmd: string, data: string | BufferSource | null = null): Promise<void> {
		const m = new Message(cmd, this.localId, this.remoteId, data);
		return await m.send(this.device);
  };

  async receive(): Promise<Message> {
    const response = await Message.receive(this.device);
    // remote's prospective of local_id/remote_id is reversed
    if (response.arg0 !== 0 && response.arg0 !== this.remoteId) {
      throw new Error(
        `Incorrect arg0: 0x${toHex32(response.arg0)} (expected 0x${toHex32(this.remoteId)})`
      );
    }
    if (this.localId !== 0 && response.arg1 !== this.localId) {
      throw new Error(
        `Incorrect arg1: 0x${toHex32(response.arg1)} (expected 0x${toHex32(this.localId)})`
      );
    }
    return response;
  }

  async sendReceive(cmd: string, data: string | BufferSource | null = null): Promise<Message> {
    await this.send(cmd, data);
    return await this.receive();
  }

  async abort(): Promise<void> {
    if (options.debug) {
      console.log('aborting...');

      // The cancel function is invoked when the stream is cancelled.
      this.cancel = async (): Promise<void> => {
        if (options.debug) {
          console.log('aborted');
        }
        this.cancel = null;
      };
    }
  }

  async stat(filename: string): Promise<StatResult> {
    const frame = new SyncFrame('STAT', filename.length);
    let response: Message | SyncFrame = await frame.sendReceive(this);
    checkOk(response, `STAT failed on ${filename}`);

    const encoder = new TextEncoder();
    response = await this.sendReceive('WRTE', encoder.encode(filename));
    checkOk(response, `STAT failed on ${filename}`);
    response = await this.receive();
    await this.send('OKAY');

    if (!(response.data instanceof DataView)) {
      throw new Error(`STAT failed on ${filename}`);
    }

    const data = response.data;
    const id = decodeCmd(data.getUint32(0, true));
    const mode = data.getUint32(4, true);
    const size = data.getUint32(8, true);
    const time = data.getUint32(12, true);

    if (options.debug) {
      console.log(`STAT: ${filename}`);
      console.log(`id: ${id}`);
      console.log(`mode: ${mode}`);
      console.log(`size: ${size}`);
      console.log(`time: ${time}`);
    }

    if (id !== `STAT`) {
      throw new Error(`STAT failed on ${filename}`);
    }

    return {
      mode,
      size,
      time
    };
  }

  async pull(filename: string): Promise<DataView> {
    const frame = new SyncFrame('RECV', filename.length);
    let response: Message | SyncFrame;
    try {
      response = await frame.sendReceive(this);
      checkOk(response, `PULL RECV failed on ${filename}`);

      const encoder = new TextEncoder();
      response = await this.sendReceive('WRTE', encoder.encode(filename));
      checkOk(response, `PULL WRTE failed on ${filename}`);

      response = await SyncFrame.receive(this);
      checkCmd(response, 'DATA', `PULL DATA failed on ${filename}`);
    } catch (err) {
      await this.send('OKAY');
      throw err;
    }
    await this.send('OKAY');

    if (!(response.data instanceof DataView)) {
      throw new Error('response.data is not a DataView instance');
    }

    const len = response.length;
    if (response.data.byteLength === len + 8) {
      const cmd = response.data.getUint32(len, true);
      const zero = response.data.getUint32(len + 4, true);
      if (decodeCmd(cmd) !== 'DONE' || zero !== 0)
        throw new Error(`PULL DONE failed on ${filename}`);

      return new DataView(response.data.buffer, 0, len);
    }

    if (response.data.byteLength > 64 * 1024) {
      const cmd = response.data.getUint32(response.data.byteLength - 8, true);
      const zero = response.data.getUint32(response.data.byteLength - 4, true);
      if (decodeCmd(cmd) !== 'DONE' || zero !== 0)
        throw new Error(`PULL DONE failed on ${filename}`);

      return new DataView(response.data.buffer, 0, response.data.byteLength - 8);
    }

    if (response.data.byteLength !== len) {
      throw new Error(`PULL DATA failed on ${filename}: ${response.data.byteLength}!=${len}`);
    }

    response = await this.receive();

    // Should never happen
    if (!(response.data instanceof DataView)) {
      throw new Error('response.data is not a DataView instance');
    }

    const cmd = response.data.getUint32(0, true);
    const zero = response.data.getUint32(4, true);
    if (decodeCmd(cmd) !== 'DONE' || zero !== 0) {
      throw new Error(`PULL DONE failed on ${filename}`);
    }
    await this.send('OKAY');
    return response.data;
  }

  async pushStart(filename: string, mode: Mode): Promise<void> {
    const modeStr = mode.toString();
    const encoder = new TextEncoder();

    const frame = new SyncFrame('SEND', filename.length + 1 + modeStr.length);
    let response = await frame.sendReceive(this);
    checkOk(response, `PUSH failed on ${filename}`);

    await this.send('WRTE', encoder.encode(filename));
    response = await SyncFrame.receive(this);
    checkOk(response, `PUSH failed on ${filename}`);

    await this.send('WRTE', encoder.encode(`,${modeStr}`));
    response = await SyncFrame.receive(this);
    checkOk(response, `PUSH failed on ${filename}`);
  }

  async pushData(data: BufferSource | string): Promise<void> {
    let newdata: ArrayBuffer;
    if (typeof data === 'string') {
			const encoder = new TextEncoder();
			const stringData = data;
			newdata = encoder.encode(stringData).buffer;
		} else if (ArrayBuffer.isView(data)) {
			newdata = data.buffer;
    } else {
      newdata = data;
    }
    const frame = new SyncFrame('DATA', newdata.byteLength);
    let response = await frame.sendReceive(this);
    checkOk(response, 'PUSH failed');
    await this.send('WRTE', newdata);
    response = await SyncFrame.receive(this);
    checkOk(response, 'PUSH failed');
  }

  async pushDone(): Promise<void> {
    const frame = new SyncFrame('DONE', Math.round(Date.now() / 1000));
    let response = await frame.sendReceive(this);
    checkOk(response, 'PUSH failed');
    response = await SyncFrame.receive(this);
    checkOk(response, 'PUSH failed');
    await this.send('OKAY');
  }

  async push(file: Blob, filename: string, mode: Mode,
        onProgress: ((count: number, size: number) => void) | null = null) {
    // TODO(andreban): we need reduced logging during the data transfer otherwise the console may
    // explode
    //
		// let old_debug = Adb.Opt.debug;
		// let old_dump = Adb.Opt.dump;
		// Adb.Opt.debug = false;
    // Adb.Opt.dump = false;

    // read the whole file
    const data = await Stream.readBlob(file);

    // Should never happen
    if (!(data instanceof ArrayBuffer)) {
      throw new Error('data is not an ArrayBuffer');
    }

    await this.pushStart(filename, mode);

    let rem = file.size;
    const max = Math.min(0x10000, this.device.maxPayload);
    while (rem > 0) {
      // these two are needed here for the closure
      const len = Math.min(rem, max);
      const count = file.size - rem;
      if (this.cancel) {
        // Adb.Opt.debug = old_debug;
        // Adb.Opt.dump = old_dump;
        this.cancel();
        throw new Error('cancelled');
      }
      if (onProgress != null) {
        onProgress(count, file.size);
      }
      await this.pushData(data.slice(count, count + len));
      rem -= len;
    }

    // Adb.Opt.debug = old_debug;
    // Adb.Opt.dump = old_dump;
    await this.pushDone();
  }

  async quit(): Promise<void> {
    const frame = new SyncFrame('QUIT');
    let response: Message | SyncFrame = await frame.sendReceive(this);
    checkOk(response, 'QUIT failed');
    response = await this.receive();
    checkCmd(response, 'CLSE', 'QUIT failed');
    await this.close();
  }

  static async open(device: AdbDevice, service: string): Promise<Stream> {
    const localId = this.nextId++;
    let remoteId = 0;
    const m = new Message('OPEN', localId, remoteId, '' + service + '\0');
    const response = await m.sendReceive(device);

    const doResponse = async (response: Message): Promise<Stream> =>  {
      if (response.arg1 !== localId) {
        const r = await Message.receive(device);
        return await doResponse(r);
      }

      if (response.cmd !== 'OKAY') {
        throw new Error('Open Failed');
      }

      remoteId = response.arg0;
      if (options.debug) {
				console.log(`Opened stream ${service}`);
				console.log(` local_id: 0x${toHex32(localId)}`);
				console.log(` remote_id: 0x${toHex32(remoteId)}`);
      }
      return new Stream(device, service, localId, remoteId);
    };

    return await doResponse(response);
  }

  static readBlob(blob: Blob): Promise<ArrayBuffer | string | null> {
    return new Promise<ArrayBuffer | string | null>((resolve, reject) => {
			const reader = new FileReader();
      reader.onload = e => {
        if (e.target === null) {
          reject(new Error('onload returned null'));
          return;
        }
        resolve(e.target.result);
      };
			reader.onerror = e => reject(e.target?.error);
			reader.readAsArrayBuffer(blob);
		});
  }
}
