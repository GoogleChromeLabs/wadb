import Connection, { DeviceMatch } from "./Connection";

const DEFAULT_MAX_PAYLOAD = 4096;

export default abstract class Device {
  readonly maxPayload: number;

  constructor(readonly connection: Connection, readonly match: DeviceMatch) {
    this.maxPayload = DEFAULT_MAX_PAYLOAD;
  }

  abstract async send(data: string | ArrayBuffer | DataView): Promise<void>;
  abstract async receive(len: number): Promise<DataView>;
}