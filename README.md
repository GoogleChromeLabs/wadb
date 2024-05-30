# An ADB Implementation using WebUSB

This project is a TypeScript implementation of the Android Debug Bridge(ADB) protocol over WebUSB.
The implementation inspired on the [webadb.js][1], with the main difference being that
implementation supports multiple concurrent streams.

This is not an exhaustive implementation of the protocol and hasn't been tested on a wide range of
devices.

A non-exhaustive list of things that are not implemented:

- `STAT`: reads stats from the Android filesystem (file size, mode and time).

## Usage

### Connecting to a device
```typescript
  const options: Options = {
    debug: true,
    useChecksum: false,
    dump: false,
    keySize: 2048,
  };

  const transport = await WebUsbTransport.open(options);
  const adbClient = new AdbClient(transport, options, keyStore);
  await adbClient.connect();
```

### Downloading a file from the device (adb pull)
```typescript
  const result: Blob = await adbClient.pull('/sdcard/my-video.mp4');
```

### Sending shell commands
```typescript
  const result: string = await adbClient.shell('uname -a');
```

### Interactive shell
```typescript
  const callback = (output: string) => {
    console.log('server: ' + output);
  };
  const shell: Shell = await adbClient.interactiveShell(callback);
  await shell.write('ls /sdcard\n');
  await shell.close();
```

## Related Documents
- https://github.com/webadb/webadb.js
- https://github.com/cstyan/adbDocumentation
- https://android.googlesource.com/platform/system/core/+/master/adb/

## Contributing

See [CONTRIBUTING](./CONTRIBUTING.md) for more.

## License

See [LICENSE](./LICENSE) for more.

## Disclaimer

This is not a Google product.

[1]: https://github.com/webadb/webadb.js
