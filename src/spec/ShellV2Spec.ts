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

import {AdbClient} from '../lib/AdbClient';
import {MockTransport} from './mock/MockTransport';
import {MockKeyStore} from './mock/MockKeyStore';
import {Options} from '../lib/Options';
import {Stream} from '../lib/Stream';
import {Message} from '../lib/message';
import {
  ShellV2,
  SHELL_V2_STDOUT,
  SHELL_V2_STDERR,
  SHELL_V2_EXIT,
} from '../lib/ShellV2';

const options = {
  debug: false,
  dump: false,
  useChecksum: false,
  keySize: 2048,
} as Options;

function createPacket(packetType: number, payload: Uint8Array | string): Uint8Array {
  const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const packet = new Uint8Array(5 + bytes.length);
  const view = new DataView(packet.buffer);
  view.setUint8(0, packetType);
  view.setUint32(1, bytes.length, true);
  packet.set(bytes, 5);
  return packet;
}

function sendPacket(stream: Stream, packetType: number, payload: Uint8Array | string): void {
  const packet = createPacket(packetType, payload);
  const view = new DataView(packet.buffer);
  stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, view));
}

function sendClose(stream: Stream): void {
  stream.consumeMessage(Message.newMessage('CLSE', 34, 1, false));
}

async function readStreamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const {done, value} = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      result += decoder.decode(value, {stream: true});
    }
  }
  result += decoder.decode();
  return result;
}

describe('ShellV2', () => {
  let mockTransport: MockTransport;
  let adbClient: AdbClient;
  let stream: Stream;

  beforeEach(() => {
    mockTransport = new MockTransport();
    adbClient = new AdbClient(mockTransport, options, new MockKeyStore());
    stream = new Stream(adbClient, 'shell,v2,raw:test', 1, 34, options);
  });

  it('receives stdout data and normal exit code', async () => {
    const shell = new ShellV2(stream);

    sendPacket(stream, SHELL_V2_STDOUT, 'Hello from stdout!\n');
    sendPacket(stream, SHELL_V2_EXIT, new Uint8Array([0]));
    sendClose(stream);

    const stdoutText = await readStreamToString(shell.stdout);
    const exitCode = await shell.exitCode;

    expect(stdoutText).toBe('Hello from stdout!\n');
    expect(exitCode).toBe(0);
  });

  it('separates stdout and stderr streams correctly', async () => {
    const shell = new ShellV2(stream);

    sendPacket(stream, SHELL_V2_STDOUT, 'out 1\n');
    sendPacket(stream, SHELL_V2_STDERR, 'err 1\n');
    sendPacket(stream, SHELL_V2_STDOUT, 'out 2\n');
    sendPacket(stream, SHELL_V2_STDERR, 'err 2\n');
    sendPacket(stream, SHELL_V2_EXIT, new Uint8Array([1]));
    sendClose(stream);

    const [stdoutText, stderrText, exitCode] = await Promise.all([
      readStreamToString(shell.stdout),
      readStreamToString(shell.stderr),
      shell.exitCode,
    ]);

    expect(stdoutText).toBe('out 1\nout 2\n');
    expect(stderrText).toBe('err 1\nerr 2\n');
    expect(exitCode).toBe(1);
  });

  it('resolves exit code to -1 if stream closes without EXIT packet', async () => {
    const shell = new ShellV2(stream);

    sendPacket(stream, SHELL_V2_STDOUT, 'abrupt end');
    sendClose(stream);

    const [stdoutText, exitCode] = await Promise.all([
      readStreamToString(shell.stdout),
      shell.exitCode,
    ]);

    expect(stdoutText).toBe('abrupt end');
    expect(exitCode).toBe(-1);
  });

  it('handles fragmented packets split across multiple messages', async () => {
    const shell = new ShellV2(stream);

    const fullPacket = createPacket(SHELL_V2_STDOUT, 'fragmented message content');
    // Split fullPacket into 3 parts:
    // part 1: 3 bytes (partial header)
    // part 2: 6 bytes (rest of header + first 4 bytes of payload)
    // part 3: remainder of payload
    const part1 = fullPacket.slice(0, 3);
    const part2 = fullPacket.slice(3, 9);
    const part3 = fullPacket.slice(9);

    stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, new DataView(part1.buffer)));
    stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, new DataView(part2.buffer)));
    stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, new DataView(part3.buffer)));
    sendPacket(stream, SHELL_V2_EXIT, new Uint8Array([0]));
    sendClose(stream);

    const stdoutText = await readStreamToString(shell.stdout);
    const exitCode = await shell.exitCode;

    expect(stdoutText).toBe('fragmented message content');
    expect(exitCode).toBe(0);
  });

  it('rejects exitCode and errors streams when packet length exceeds maximum', async () => {
    const shell = new ShellV2(stream);

    // Create an oversized packet header
    const badHeader = new Uint8Array(5);
    const view = new DataView(badHeader.buffer);
    view.setUint8(0, SHELL_V2_STDOUT);
    view.setUint32(1, 2 * 1024 * 1024, true); // 2 MiB exceeds MAX_PACKET_LENGTH

    stream.consumeMessage(Message.newMessage('WRTE', 34, 1, false, view));

    await expectAsync(shell.exitCode).toBeRejectedWithError(/exceeds maximum allowed/);
    const reader = shell.stdout.getReader();
    await expectAsync(reader.read()).toBeRejectedWithError(/exceeds maximum allowed/);
  });

  it('allows sending stdin to the running process', async () => {
    const shell = new ShellV2(stream);

    // Queue response OKAY for stdin write
    stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));

    await expectAsync(shell.writeStdin('input data\n')).toBeResolved();
  });

  it('allows closing stdin', async () => {
    const shell = new ShellV2(stream);

    // Queue response OKAY for closeStdin
    stream.consumeMessage(Message.newMessage('OKAY', 34, 1, false));

    await expectAsync(shell.closeStdin()).toBeResolved();
  });

  it('closes stream when consumer cancels streams', async () => {
    const shell = new ShellV2(stream);
    spyOn(shell, 'close').and.callThrough();

    const stdoutReader = shell.stdout.getReader();
    const stderrReader = shell.stderr.getReader();

    await stdoutReader.cancel();
    await stderrReader.cancel();

    expect(shell.close).toHaveBeenCalled();
  });
});
