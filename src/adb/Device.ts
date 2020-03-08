import Transport, { DeviceMatch } from './Transport';
import {getEndpointNum} from './Helpers';

export default abstract class Device {
  maxPayload: number;
  readonly endpointIn: number;
  readonly endpointOut: number;

  constructor(readonly transport: Transport, readonly match: DeviceMatch, maxPayLoad: number) {
    this.maxPayload = maxPayLoad;
    this.endpointIn = getEndpointNum(match.alternate.endpoints, 'in');
		this.endpointOut = getEndpointNum(match.alternate.endpoints, 'out');
  }

  async send(data: string | ArrayBuffer): Promise<void> {
		if (typeof data === 'string') {
			const encoder = new TextEncoder();
			const stringData = data;
      data = encoder.encode(stringData).buffer;
		}

		if (data != null && data.byteLength > this.maxPayload) {
      throw new Error(`data is too big: ${data.byteLength} bytes (max: ${this.maxPayload} bytes)`);
    }

		await this.transport.send(this.endpointOut, data);
  }

  protected async receive(len: number): Promise<DataView> {
    return await this.transport.receive(this.endpointIn, len);
  }
}
