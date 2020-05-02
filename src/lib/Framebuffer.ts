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

import {Stream} from './Stream';
import {AdbClient} from './AdbClient';
import {Options} from './Options';

 /**
  * framebuffer:
  *   This service is used to send snapshots of the framebuffer to a client.
  *   It requires sufficient privileges but works as follow:
  *
  *     After the OKAY, the service sends 16-byte binary structure
  *     containing the following fields (little-endian format):
  *
  *           depth:   uint32_t:    framebuffer depth
  *           size:    uint32_t:    framebuffer size in bytes
  *           width:   uint32_t:    framebuffer width in pixels
  *           height:  uint32_t:    framebuffer height in pixels
  *
  *     With the current implementation, depth is always 16, and
  *     size is always width*height*2
  *
  *     Then, each time the client wants a snapshot, it should send
  *     one byte through the channel, which will trigger the service
  *     to send it 'size' bytes of framebuffer data.
  *
  *     If the adbd daemon doesn't have sufficient privileges to open
  *     the framebuffer device, the connection is simply closed immediately.
  *
  * Definitions from `system/core/adb/daemon/framebuffer_service.cpp`
  *
  * struct fbinfo {
  *   unsigned int version;
  *   unsigned int bpp;
  *   unsigned int colorSpace;
  *   unsigned int size;
  *   unsigned int width;
  *   unsigned int height;
  *   unsigned int red_offset;
  *   unsigned int red_length;
  *   unsigned int blue_offset;
  *   unsigned int blue_length;
  *   unsigned int green_offset;
  *   unsigned int green_length;
  *   unsigned int alpha_offset;
  *   unsigned int alpha_length;
  * }
  */
export class Framebuffer {
  // static DDMS_RAWIMAGE_VERSION = 2;
  static BYTE_LENGTH = 56;

  private constructor(
    readonly version: number,
    readonly bpp: number,
    readonly colorSpace: number,
    readonly size: number,
    readonly width: number,
    readonly height: number,
    readonly redOffset: number,
    readonly redLength: number,
    readonly blueOffset: number,
    readonly blueLength: number,
    readonly greenOffset: number,
    readonly greenLength: number,
    readonly alphaOffset: number,
    readonly alphaLength: number,
    readonly imageData: Uint8ClampedArray) {}

  static async create(adbClient: AdbClient, options: Options): Promise<Framebuffer> {
    const stream = await Stream.open(adbClient, 'framebuffer:', options);
    let message = await stream.read();

    if (message.header.cmd !== 'WRTE') {
      await stream.write('CLSE');
      throw new Error(`Expected WRTE message but received ${message.header.cmd}`);
    }

    if (!message.data) {
      await stream.write('CLSE');
      throw new Error('message doesn\'t contain data');
    }

    await stream.write('OKAY');

    const version = message.data.getUint32(0, true);
    const bpp = message.data.getUint32(4, true);
    const colorSpace = message.data.getUint32(8, true);
    const size = message.data.getUint32(12, true);
    const width = message.data.getUint32(16, true);
    const height = message.data.getUint32(20, true);
    const redOffset = message.data.getUint32(24, true);
    const redLength = message.data.getUint32(28, true);
    const blueOffset = message.data.getUint32(32, true);
    const blueLength = message.data.getUint32(36, true);
    const greenOffset = message.data.getUint32(40, true);
    const greenLength = message.data.getUint32(44, true);
    const alphaOffset = message.data.getUint32(48, true);
    const alphaLength = message.data.getUint32(52, true);

    const buffer = new Uint8Array(size);

    let bytesReceived = 0;
    let data = new Uint8Array(message.data.buffer.slice(Framebuffer.BYTE_LENGTH));
    buffer.set(data, 0);
    bytesReceived = data.length;

    while (bytesReceived < size) {
      message = await stream.read();

      if (message.header.cmd === 'CLSE') {
        break;
      }

      if (!message.data) {
        await stream.write('CLSE');
        throw new Error('message doesn\'t contain data');
      }

      data = new Uint8Array(message.data?.buffer!);

      buffer.set(data, bytesReceived);
      bytesReceived += data.length;
      await stream.write('OKAY');
    }

    await stream.close();

    return new Framebuffer(
      version,
      bpp,
      colorSpace,
      size,
      width,
      height,
      redOffset,
      redLength,
      blueOffset,
      blueLength,
      greenOffset,
      greenLength,
      alphaOffset,
      alphaLength,
      Uint8ClampedArray.from(buffer),
    );
  }
}
