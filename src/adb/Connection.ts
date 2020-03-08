export type authUserVerify = (publickKey: string) => void;
export interface DeviceMatch {
  conf: USBConfiguration;
  intf: USBInterface;
  alternate: USBAlternateInterface;
}

export default abstract class Connection {
  constructor(readonly device: USBDevice) {
  }

  async abstract connect(banner: string, authUserVerify: authUserVerify | null): Promise<void>;

  close() {
    this.device.close();        
  }

  send(ep: number, data: BufferSource) {
    this.device.transferOut(ep, data);
  }

  async receive(ep: number, len: number) {
    const response = await this.device.transferIn(ep, len);
    return response.data;
  }

  find(filter: USBDeviceFilter): DeviceMatch | null {
    for (let configuration of this.device.configurations) {
      for (let intf of configuration.interfaces) {
        for (let alternate of intf.alternates) {
          if (filter.classCode == alternate.interfaceClass &&
              filter.subclassCode == alternate.interfaceSubclass &&
              filter.protocolCode == alternate.interfaceProtocol) {
            return {
              conf: configuration,
              intf: intf,
              alternate: alternate
            };
          }
        }
      }
    }
    return null;
  }

  async getDevice(filter: USBDeviceFilter): Promise<DeviceMatch | null> {
    const match = this.find(filter);
    if (!match) {
      return null;
    }
    await this.device.selectConfiguration(match.conf.configurationValue);
    await this.device.claimInterface(match.intf.interfaceNumber);
    await this.device.selectAlternateInterface(
        match.intf.interfaceNumber, match.alternate.alternateSetting);
    return match;
  }
}
