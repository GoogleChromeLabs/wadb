import Stream from './Stream';
import Message from './Message';
import {encodeCmd, decodeCmd, hexdump} from './Helpers';
import {Options, DEFAULT_OPTIONS} from './Options';

const options: Options = DEFAULT_OPTIONS;

export default class SyncFrame {
  readonly cmd: string;
  readonly length: number;
  readonly data?: DataView;

  constructor(cmd: string, length: number = 0, data?: DataView) {
      this.cmd = cmd;
      this.length = length;
      this.data = data;
  }

  async send(stream: Stream): Promise<void> {
      return SyncFrame.send(stream, this);
  }

  async sendReceive(stream: Stream): Promise<SyncFrame> {
      await this.send(stream);
      return await SyncFrame.receive(stream);
  }

  static async send(stream: Stream, frame: SyncFrame): Promise<void> {
    const data = new ArrayBuffer(8);
    const cmd = encodeCmd(frame.cmd);

    if (options.debug) {
      console.log(frame);
    }

    const view = new DataView(data);
    view.setUint32(0, cmd, true);
    view.setUint32(4, frame.length, true);

    return stream.send('WRTE', data);
  }

  static async receive(stream: Stream): Promise<SyncFrame> {
    let response = await stream.receive();
    if (response.cmd === 'WRTE') {
      let responseData = response.dataAsDataView();
      const cmd = decodeCmd(responseData.getUint32(0, true));
      if (cmd === 'OKAY' || cmd === 'DATA' || cmd === 'DONE' || cmd === 'FAIL') {
        const len = responseData.getUint32(4, true);
        const data = new DataView(responseData.buffer.slice(8));

        if (len === 0 || data.byteLength >= len) {
          const frame = new SyncFrame(cmd, len, data);
          if (options.debug) {
            console.log(frame);
          }
          return frame;
        }

        await stream.send('OKAY');
        response = await stream.receive();
        if (response.data == null) {
          const frame = new SyncFrame(cmd);
          if (options.debug) {
            console.log(frame);
          }
          return frame;
        }

        responseData = response.dataAsDataView();
        const cmd2 = decodeCmd(responseData.getUint32(0, true));
        if (cmd2 === 'OKAY' || cmd2 === 'DATA' || cmd2 === 'DONE' || cmd2 === 'FAIL') {
          const len = responseData.getUint32(4, true);
          const data = new DataView(responseData.buffer.slice(8));

          if (len === 0 || data.byteLength >= len) {
            const frame = new SyncFrame(cmd2, len, data);
            if (options.debug) {
              console.log(frame);
            }
            return frame;
          }
        }

        if (responseData.byteLength < len) {
          throw new Error(`expected at least ${len}, got ${responseData.byteLength}`);
        }

        const frame = new SyncFrame(cmd, len, responseData);
        if (options.debug) {
          console.log(frame);
        }
        return frame;
      }

      if (options.debug) {
        console.log(response);
      }

      if (options.dump) {
        hexdump(responseData, 'WRTE: ');
      }

      throw new Error('invalid WRTE frame');
    }

    if (response.cmd === 'OKAY') {
      const frame = new SyncFrame('OKAY');
      if (options.debug) {
        console.log(frame);
      }
      return frame;
    }

    if (options.debug) {
      console.log(response);
    }

    throw new Error('invalid SYNC frame');
  }
}
