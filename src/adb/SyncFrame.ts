import Stream from "./Stream";
import Message from "./Message";

export default class SyncFrame {
    readonly cmd: string;
    readonly length: number;
    readonly data?: DataView;

    constructor(cmd: string, length: number = 0, data: DataView | undefined = undefined) {
        this.cmd = cmd;
        this.length = length;
        this.data = data;
    }

    async send(stream: Stream): Promise<void> {
        return SyncFrame.send(stream, this);
    }

    async sendReceive(stream: Stream): Promise<Message> {
        await this.send(stream);
        return await SyncFrame.receive(stream);
    }

    static async send(stream: Stream, frame: SyncFrame): Promise<void> {
        throw new Error('Not Implemented Yet');
    }

    static async receive(stream: Stream): Promise<Message> {
        throw new Error('Not Implemented Yet');        
    }
}
