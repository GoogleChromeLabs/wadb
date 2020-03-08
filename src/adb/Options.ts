export interface Options {
  useChecksum: boolean;
  debug: boolean;
  dump: boolean;
  reuseKey: boolean;
  keySize: number;
}

export const DEFAULT_OPTIONS: Options = {
  useChecksum: true,
  debug: false,
  dump: false,
  reuseKey: false,
  keySize: 2048,
}

export function getOptions(): Options {
  return DEFAULT_OPTIONS;
}
