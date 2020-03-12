import Transport from './lib/Transport';
import { KeyStore } from './lib/KeyStore';

class MyKeyStore implements KeyStore {
  private keys: CryptoKeyPair[] = [];
  async loadKeys(): Promise<CryptoKeyPair[]> {
    return this.keys;
  }  
  
  async saveKey(key: CryptoKeyPair): Promise<void> {
    this.keys.push(key);
    console.log('Saving Key' + key);
  }
}

const myKeyStore = new MyKeyStore();
let transport: Transport;

const connectButton = document.querySelector('#connect');
connectButton?.addEventListener('click', async (_) => {
  try {
    if (transport) {
      await transport.close();
    }
    transport = await Transport.open(myKeyStore);
    console.log('transport created');
    const adb = await transport.connectAdb('host::', (publicKey) => console.log(publicKey));
    console.log('adb connected');
    const shell = await adb.shell('pm list packages -f');
    const response = await shell.receive();
    await shell.close();
    console.log(response.dataAsString());
  } catch(e) {
    console.error('Connection Failed: ', e);
  }
});

const disconnectButton = document.querySelector('#disconnect');
disconnectButton?.addEventListener('click', async (_) => {
  try {
    if (transport) {
      await transport.close();
      console.log('Disconnected');
    }
  } catch(e) {
    console.error('Connection Failed: ', e);
  }
});

