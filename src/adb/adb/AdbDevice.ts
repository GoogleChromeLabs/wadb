import Device from '../Device';
import Stream from '../Stream';
import Transport, { DeviceMatch } from '../Transport';

const DEFAULT_MAX_PAYLOAD = 4096;

export default class AdbDevice extends Device {
  mode?: string;
  banner?: string;

  constructor(transport: Transport, match: DeviceMatch) {
    super(transport, match, DEFAULT_MAX_PAYLOAD);
  }

  async receive(len: number): Promise<DataView> {
    return await super.receive(len);
  }

  async open(service: string): Promise<Stream> {
    return await Stream.open(this, service);
  }

  async shell(command: string): Promise<Stream> {
    return await Stream.open(this, `shell:${command}`);
  }

  async tcpip(port: number): Promise<Stream> {
    return await Stream.open(this, `tcpip:${port}`);
  }

  async sync(): Promise<Stream> {
    return await Stream.open(this, 'sync:');
  }

  async reboot(command: string = ''): Promise<Stream> {
    return await Stream.open(this, `reboot:${command}`);
  }
}
