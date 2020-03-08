import Device from '../Device';
import Transport, { DeviceMatch } from '../Transport';

const DEFAULT_MAX_PAYLOAD = 64;

export default class FastbootDevice extends Device {
  constructor(transport: Transport, match: DeviceMatch) {
    super(transport, match, DEFAULT_MAX_PAYLOAD);
  }

  async receive(): Promise<DataView> {
    return await this.transport.receive(this.endpointIn, 64);
  }
}
