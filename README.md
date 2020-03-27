# An ADB Implementation using WebUSB

## Connecting to a device
```typescript
  const options: Options = {
    debug: true,
    useChecksum: false,
    dump: false,
    keySize: 2048,
  };

  const transport = await Transport.open(options);
  const adbClient = new AdbClient(transport, options, keyStore);
  await adbClient.connect();
```

## Downloading a file from the device (adb pull)
```typescript
  const result: Blob = await adbClient.pull('/sdcard/my-video.mp4');
```

## Sending shell commands
```typescript
  const result: string = await adbClient.shell('uname -a');
```

## Interactive shell
```typescript
  const callback = (output: string) => {
    console.log('server: ' + output);
  };
  const shell: Shell = await adbClient.interactiveShell(callback);
  shell.write('ls /sdcard\n');
```

## Related Documents
https://github.com/webadb/webadb.js
https://github.com/cstyan/adbDocumentation
