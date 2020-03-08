import Device from './Device';
import Message from './Message';
import SyncFrame from './SyncFrame';
import {Options, DEFAULT_OPTIONS} from './Options';
import {toHex32, decodeCmd} from './Helpers';

const options: Options = DEFAULT_OPTIONS;

export type StatResult =  {
  mode: number,
  size: number,
  time: number,
};

export default class Stream {
  private device: Device;
  private service: string;
  private localId: number;
  private remoteId: number;
  private cancel: (() => Promise<void>) | null = null;
  private static nextId = 1;

  constructor(device: Device, service: string, localId: number, remoteId: number) {
    this.device = device;
    this.service = service;
    this.localId = localId;
    this.remoteId = remoteId;
  }

  async close(): Promise<void> {
		if (this.localId != 0) {
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

  async send(cmd: string, data: string | DataView | null = null): Promise<void> {
		const m = new Message(cmd, this.localId, this.remoteId, data);
		return await m.send(this.device);
  };
  
  async receive(): Promise<Message> {
    const response = await Message.receive(this.device);
    // remote's prospective of local_id/remote_id is reversed
    if (response.arg0 != 0 && response.arg0 != this.remoteId) {
      throw new Error(
        `Incorrect arg0: 0x${toHex32(response.arg0)} (expected 0x${toHex32(this.remoteId)})`
      );
    }
    if (this.localId != 0 && response.arg1 != this.localId) {
      throw new Error(
        `Incorrect arg1: 0x${toHex32(response.arg1)} (expected 0x${toHex32(this.localId)})`
      );
    }
    return response;    
  }

  async sendReceive(cmd: string, data: string | DataView | null = null): Promise<Message> {
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
    let response = await frame.sendReceive(this);
    response.checkOk(`STAT failed on ${filename}`);

    const encoder = new TextEncoder();
    response = await this.sendReceive('WRTE', new DataView(encoder.encode(filename)));
    response.checkOk(`STAT failed on ${filename}`);
    response = await this.receive();
    await this.send('OKAY');

    if (!(response.data instanceof DataView)) {
      throw new Error(`STAT failed on ${filename}`);
    }

    const data = response.data;
    let id = decodeCmd(data.getUint32(0, true));
    let mode = data.getUint32(4, true);
    let size = data.getUint32(8, true);
    let time = data.getUint32(12, true);

    if (options.debug) {
      console.log(`STAT: ${filename}`);
      console.log(`id: ${id}`);
      console.log(`mode: ${mode}`);
      console.log(`size: ${size}`);
      console.log(`time: ${time}`);
    }

    if (id != `STAT`) {
      throw new Error(`STAT failed on ${filename}`);
    }

    return {
      mode: mode,
      size: size,
      time: time
    };    
  }

  async pull(filename: string): Promise<DataView> {
    const frame = new SyncFrame('RECV', filename.length);
    let response;
    try {      
      response = await frame.sendReceive(this);
      response.checkOk(`PULL RECV failed on ${filename}`);

      const encoder = new TextEncoder();
      response = await this.sendReceive('WRTE', new DataView(encoder.encode(filename)));
      response.checkOk(`PULL WRTE failed on ${filename}`);

      response = await SyncFrame.receive(this);
      response.checkCmd('DATA', `PULL DATA failed on ${filename}`);
    } catch (err) {
      await this.send('OKAY');
      throw err;      
    }
    await this.send('OKAY');

    if (!(response.data instanceof DataView)) {
      throw new Error('response.data is not a DataView instance');
    }

    let len = response.length;
    if (response.data.byteLength == len + 8) {
      let cmd = response.data.getUint32(len, true);
      let zero = response.data.getUint32(len + 4, true);
      if (decodeCmd(cmd) != 'DONE' || zero != 0)
        throw new Error(`PULL DONE failed on ${filename}`);

      return new DataView(response.data.buffer, 0, len);
    }

    if (response.data.byteLength > 64 * 1024) {
      let cmd = response.data.getUint32(response.data.byteLength - 8, true);
      let zero = response.data.getUint32(response.data.byteLength - 4, true);
      if (decodeCmd(cmd) != 'DONE' || zero != 0)
        throw new Error(`PULL DONE failed on ${filename}`);

      return new DataView(response.data.buffer, 0, response.data.byteLength - 8);
    }

    if (response.data.byteLength != len) {
      throw new Error(`PULL DATA failed on ${filename}: ${response.data.byteLength}!=${len}`);
    }

    response = await this.receive();

    // Should never happen
    if (!(response.data instanceof DataView)) {
      throw new Error('response.data is not a DataView instance');
    }

    let cmd = response.data.getUint32(0, true);
    let zero = response.data.getUint32(4, true);
    if (decodeCmd(cmd) != 'DONE' || zero != 0) {
      throw new Error(`PULL DONE failed on ${filename}`);    
    }
    await this.send('OKAY');
    return response.data;
  }

  static async open(device: Device, service: any): Promise<Stream> {
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
}