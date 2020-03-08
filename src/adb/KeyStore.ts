export interface KeyStore {
  loadKeys(): Promise<CryptoKeyPair[]>;
  saveKey(key: CryptoKeyPair): Promise<void>;
}
