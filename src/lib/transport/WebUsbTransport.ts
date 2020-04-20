/*
 * Copyright 2020 Google Inc. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import {Transport} from './Transport';
import {hexdump} from '../Helpers';
import {Options} from '../Options';

const ADB_DEVICE = {classCode: 255, subclassCode: 66, protocolCode: 1} as USBDeviceFilter;
const FASTBOOT_DEVICE = {classCode: 255, subclassCode: 66, protocolCode: 3} as USBDeviceFilter;
const DEVICE_FILTERS = [ADB_DEVICE, FASTBOOT_DEVICE];

interface DeviceMatch {
  conf: USBConfiguration;
  intf: USBInterface;
  alternate: USBAlternateInterface;
}

/**
 * An implementation of {@link Transport} using WebUSB as the tranport layer.
 */
export class WebUsbTransport implements Transport {
  private constructor(
    readonly device: USBDevice,
    readonly match: DeviceMatch,
    readonly endpointIn: number,
    readonly endpointOut: number,
    readonly options: Options,
    readonly log = console.log) {
  }

  /**
   *  Releases the interface and closes the connection to the WebUSB device
   */
  async close(): Promise<void> {
    await this.device.releaseInterface(this.match.intf.interfaceNumber);
    await this.device.close();
  }

  /**
   * Sends data to the USB device
   *
   * @param {ArrayBuffer} data the data to be sent to the interface
   */
  async write(data: ArrayBuffer): Promise<void> {
    if (this.options.dump) {
      hexdump(new DataView(data), '' + this.endpointOut + '==> ');
    }

    await this.device.transferOut(this.endpointOut, data);
  }

  /**
   * Receives data from the USB device
   *
   * @param {number} len the length of date to be read
   * @returns {Promise<DataView} data read from the device
   */
  async read(len: number): Promise<DataView> {
    const response = await this.device.transferIn(this.endpointIn, len);
    if (!response.data) {
      throw new Error('Response didn\'t contain any data');
    }
    return response.data;
  }

  /**
   * @returns {boolean} true if the connected device is an ADB device.
   */
	isAdb(): boolean {
		const match = WebUsbTransport.findMatch(this.device, ADB_DEVICE);
		return match != null;
	};

  /**
   * @returns {boolean} true if the connected device is a Fastboot device.
   */
	isFastboot(): boolean {
		const match = WebUsbTransport.findMatch(this.device, FASTBOOT_DEVICE);
		return match != null;
  };

  /**
   * Opens a connection to a WebUSB device
   *
   * @param options
   */
  static async open(options: Options): Promise<WebUsbTransport> {
    const device = await navigator.usb.requestDevice({filters: DEVICE_FILTERS});
    await device.open();

    // Find the WebUSB device
    const match = this.findMatch(device, ADB_DEVICE);
    if (!match) {
      throw new Error('Could not find an ADB device');
    }

    // Select the configuration and claim the interface
    await device.selectConfiguration(match.conf.configurationValue);
    await device.claimInterface(match.intf.interfaceNumber);
    // await device.selectAlternateInterface(
    //     match.intf.interfaceNumber, match.alternate.alternateSetting);

    // Store the correct endpoints
    const endpointIn = WebUsbTransport.getEndpointNum(match.alternate.endpoints, 'in');
    const endpointOut = WebUsbTransport.getEndpointNum(match.alternate.endpoints, 'out');

    const transport = new WebUsbTransport(device, match, endpointIn, endpointOut, options);
    if (options.debug) {
      console.log('Created new Transport: ', transport);
    }
    return transport;
  }

  private static findMatch(device: USBDevice, filter: USBDeviceFilter): DeviceMatch | null {
    for (const configuration of device.configurations) {
      for (const intf of configuration.interfaces) {
        for (const alternate of intf.alternates) {
          if (filter.classCode === alternate.interfaceClass &&
              filter.subclassCode === alternate.interfaceSubclass &&
              filter.protocolCode === alternate.interfaceProtocol) {
            return {
              conf: configuration,
              intf,
              alternate
            };
          }
        }
      }
    }
    return null;
  }

  private static getEndpointNum(endpoints: USBEndpoint[], dir: 'in' | 'out', type = 'bulk'): number {
    for(const ep of endpoints) {
      if (ep.direction === dir && ep.type === type) {
        return ep.endpointNumber;
      }
    }
    throw new Error(`Cannot find ${dir} endpoint`);
  }
}
