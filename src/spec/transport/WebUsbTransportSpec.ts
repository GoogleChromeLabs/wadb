/*
 * Copyright 2026 Google Inc. All Rights Reserved.
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

import {WebUsbTransport} from '../../lib/transport/WebUsbTransport';
import {Options} from '../../lib/Options';

function createMockDevice(isAdb: boolean, overrides: Record<string, unknown> = {}): USBDevice {
  return {
    opened: false,
    configurations: [
      {
        configurationValue: 1,
        configurationName: isAdb ? 'ADB Config' : 'Other Config',
        interfaces: [
          {
            interfaceNumber: 0,
            claimed: false,
            alternates: [
              {
                alternateSetting: 0,
                interfaceClass: isAdb ? 255 : 0,
                interfaceSubclass: isAdb ? 66 : 0,
                interfaceProtocol: isAdb ? 1 : 0,
                interfaceName: isAdb ? 'ADB Interface' : 'Other Interface',
                endpoints: [
                  {
                    endpointNumber: 1,
                    direction: 'in',
                    type: 'bulk',
                    packetSize: 512,
                  },
                  {
                    endpointNumber: 2,
                    direction: 'out',
                    type: 'bulk',
                    packetSize: 512,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    open: jasmine.createSpy('open').and.resolveTo(),
    close: jasmine.createSpy('close').and.resolveTo(),
    selectConfiguration: jasmine.createSpy('selectConfiguration').and.resolveTo(),
    claimInterface: jasmine.createSpy('claimInterface').and.resolveTo(),
    releaseInterface: jasmine.createSpy('releaseInterface').and.resolveTo(),
    transferIn: jasmine.createSpy('transferIn'),
    transferOut: jasmine.createSpy('transferOut'),
    ...overrides,
  } as unknown as USBDevice;
}

describe('WebUsbTransport', () => {
  const options = {
    debug: false,
    dump: false,
    useChecksum: false,
    keySize: 2048,
  } as Options;

  let mockDevice: jasmine.SpyObj<USBDevice>;
  let transport: WebUsbTransport;
  const endpointIn = 1;
  const endpointOut = 2;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    mockDevice = jasmine.createSpyObj<USBDevice>('USBDevice', [
      'transferIn',
      'transferOut',
      'releaseInterface',
      'close',
    ]);
    mockDevice.releaseInterface.and.resolveTo();
    mockDevice.close.and.resolveTo();

    const mockMatch = {
      conf: {} as USBConfiguration,
      intf: {interfaceNumber: 0} as USBInterface,
      alternate: {} as USBAlternateInterface,
    };

    // Instantiate via type-cast since constructor is private
    transport = new (WebUsbTransport as unknown as {
      new (
        device: USBDevice,
        match: typeof mockMatch,
        endpointIn: number,
        endpointOut: number,
        options: Options
      ): WebUsbTransport;
    })(mockDevice, mockMatch, endpointIn, endpointOut, options);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  describe('#read', () => {
    it('returns empty DataView immediately when len is 0', async () => {
      const result = await transport.read(0);
      expect(result.byteLength).toBe(0);
      expect(mockDevice.transferIn).not.toHaveBeenCalled();
    });

    it('returns single chunk directly when transferIn returns exact requested length', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      mockDevice.transferIn.and.resolveTo({
        status: 'ok',
        data: new DataView(data.buffer),
      });

      const result = await transport.read(5);
      expect(mockDevice.transferIn).toHaveBeenCalledTimes(1);
      expect(mockDevice.transferIn).toHaveBeenCalledWith(endpointIn, 5);
      expect(result.byteLength).toBe(5);
      expect(new Uint8Array(result.buffer)).toEqual(data);
    });

    it('assembles multiple chunks when transferIn returns segmented data', async () => {
      const chunk1 = new Uint8Array([10, 20, 30]);
      const chunk2 = new Uint8Array([40, 50]);
      const chunk3 = new Uint8Array([60, 70, 80, 90, 100]);

      mockDevice.transferIn.and.returnValues(
        Promise.resolve({status: 'ok', data: new DataView(chunk1.buffer)}),
        Promise.resolve({status: 'ok', data: new DataView(chunk2.buffer)}),
        Promise.resolve({status: 'ok', data: new DataView(chunk3.buffer)}),
      );

      const result = await transport.read(10);
      expect(mockDevice.transferIn).toHaveBeenCalledTimes(3);
      expect(mockDevice.transferIn.calls.argsFor(0)).toEqual([endpointIn, 10]);
      expect(mockDevice.transferIn.calls.argsFor(1)).toEqual([endpointIn, 7]);
      expect(mockDevice.transferIn.calls.argsFor(2)).toEqual([endpointIn, 5]);

      expect(result.byteLength).toBe(10);
      const expected = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      expect(new Uint8Array(result.buffer)).toEqual(expected);
    });

    it('rejects when initial transferIn contains no data', async () => {
      mockDevice.transferIn.and.resolveTo({
        status: 'ok',
        data: undefined,
      });

      await expectAsync(transport.read(10)).toBeRejectedWithError('Response didn\'t contain any data');
    });

    it('rejects when initial transferIn contains 0 bytes', async () => {
      mockDevice.transferIn.and.resolveTo({
        status: 'ok',
        data: new DataView(new ArrayBuffer(0)),
      });

      await expectAsync(transport.read(10)).toBeRejectedWithError('Response didn\'t contain any data');
    });

    it('rejects when subsequent transferIn returns no data during segmented read', async () => {
      const chunk1 = new Uint8Array([1, 2, 3]);
      mockDevice.transferIn.and.returnValues(
        Promise.resolve({status: 'ok', data: new DataView(chunk1.buffer)}),
        Promise.resolve({status: 'ok', data: undefined}),
      );

      await expectAsync(transport.read(10)).toBeRejectedWithError('Response didn\'t contain any data');
    });
  });

  describe('#write', () => {
    it('writes payload to endpointOut via transferOut', async () => {
      const payload = new Uint8Array([1, 2, 3, 4]).buffer;
      mockDevice.transferOut.and.resolveTo({status: 'ok', bytesWritten: 4});

      await transport.write(payload);
      expect(mockDevice.transferOut).toHaveBeenCalledTimes(1);
      expect(mockDevice.transferOut).toHaveBeenCalledWith(endpointOut, payload);
    });
  });

  describe('#close', () => {
    it('releases interface and closes device', async () => {
      await transport.close();
      expect(mockDevice.releaseInterface).toHaveBeenCalledWith(0);
      expect(mockDevice.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('#findAdbDevices', () => {
    it('returns empty array if navigator.usb is unavailable', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      const devices = await WebUsbTransport.findAdbDevices();
      expect(devices).toEqual([]);
    });

    it('returns only devices matching ADB interface filter', async () => {
      const adbDevice = createMockDevice(true);
      const nonAdbDevice = createMockDevice(false);
      const mockUsb = {
        getDevices: jasmine.createSpy('getDevices').and.resolveTo([adbDevice, nonAdbDevice]),
      };

      Object.defineProperty(globalThis, 'navigator', {
        value: {usb: mockUsb},
        configurable: true,
        writable: true,
      });

      const devices = await WebUsbTransport.findAdbDevices();
      expect(devices.length).toBe(1);
      expect(devices[0]).toBe(adbDevice);
    });

    it('returns empty array when no paired devices match ADB filter', async () => {
      const nonAdbDevice = createMockDevice(false);
      const mockUsb = {
        getDevices: jasmine.createSpy('getDevices').and.resolveTo([nonAdbDevice]),
      };

      Object.defineProperty(globalThis, 'navigator', {
        value: {usb: mockUsb},
        configurable: true,
        writable: true,
      });

      const devices = await WebUsbTransport.findAdbDevices();
      expect(devices).toEqual([]);
    });
  });

  describe('#openDevice', () => {
    it('throws when device is not provided', async () => {
      await expectAsync(
          WebUsbTransport.openDevice(null as unknown as USBDevice, options)
      ).toBeRejectedWithError('Device is required');
    });

    it('throws when device does not have an ADB interface', async () => {
      const nonAdbDevice = createMockDevice(false);
      await expectAsync(
          WebUsbTransport.openDevice(nonAdbDevice, options)
      ).toBeRejectedWithError('Could not find an ADB device');
      expect(nonAdbDevice.open).toHaveBeenCalled();
    });

    it('successfully opens and configures an ADB device', async () => {
      const adbDevice = createMockDevice(true);
      const openTransport = await WebUsbTransport.openDevice(adbDevice, options);

      expect(adbDevice.open).toHaveBeenCalled();
      expect(adbDevice.selectConfiguration).toHaveBeenCalledWith(1);
      expect(adbDevice.claimInterface).toHaveBeenCalledWith(0);
      expect(openTransport.isAdb()).toBeTrue();
      expect(openTransport.endpointIn).toBe(1);
      expect(openTransport.endpointOut).toBe(2);
    });
  });

  describe('#open', () => {
    it('throws error when WebUSB is unavailable', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      await expectAsync(
          WebUsbTransport.open(options)
      ).toBeRejectedWithError(/WebUSB is not available/);
    });

    it('prompts user and opens the requested device', async () => {
      const adbDevice = createMockDevice(true);
      const mockUsb = {
        requestDevice: jasmine.createSpy('requestDevice').and.resolveTo(adbDevice),
      };

      Object.defineProperty(globalThis, 'navigator', {
        value: {usb: mockUsb},
        configurable: true,
        writable: true,
      });

      const openTransport = await WebUsbTransport.open(options);
      expect(mockUsb.requestDevice).toHaveBeenCalled();
      expect(adbDevice.open).toHaveBeenCalled();
      expect(openTransport.isAdb()).toBeTrue();
    });
  });
});
