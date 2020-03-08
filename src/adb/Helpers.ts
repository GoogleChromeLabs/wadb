export function encodeCmd(cmd: string): number {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(cmd).buffer;
    const view = new DataView(buffer);
    return view.getUint32(0, true);    
}

export function decodeCmd(cmd: number): string {
    const decoder = new TextDecoder();
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, cmd, true);
    return decoder.decode(buffer);
}

export function toHex8(num: number) {
    return paddit(num.toString(16), 2, "0");
}

export function toHex16(num: number) {
    return paddit(num.toString(16), 4, "0");
}

export function toHex32(num: number) {
    return paddit(num.toString(16), 8, "0");
}

function paddit(text: string, width: number, padding: string) {
    let padlen = width - text.length;
    let padded = "";

    for (let i = 0; i < padlen; i++)
        padded += padding;

    return padded + text;
}
