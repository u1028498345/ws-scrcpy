import Connection from '@devicefarmer/adbkit/dist/src/adb/connection';
import Parser from '@devicefarmer/adbkit/dist/src/adb/parser';
import Protocol from '@devicefarmer/adbkit/dist/src/adb/protocol';
import { Multiplexer } from '../../../packages/multiplexer/Multiplexer';

export class ExtendedSync {
    private parser: Parser;

    constructor(private connection: Connection) {
        this.connection = connection;
        this.parser = this.connection.parser;
    }

    public async pipeReadDir(path: string, stream: Multiplexer): Promise<void> {
        const readNext = async (): Promise<void> => {
            const reply = await this.parser.readAscii(4);
            switch (reply) {
                case Protocol.DENT:
                    const stat = await this.parser.readBytes(16);
                    const namelen = stat.readUInt32LE(12);
                    const name = await this.parser.readBytes(namelen);
                    stream.send(Buffer.concat([Buffer.from(reply), stat, name]));
                    return readNext();
                case Protocol.DONE:
                    await this.parser.readBytes(16);
                    stream.close(0);
                    return;
                case Protocol.FAIL:
                    return this._readError(stream);
                default:
                    return this.parser.unexpected(reply, 'DENT, DONE or FAIL');
            }
        };
        await this._sendCommandWithArg(Protocol.LIST, path);
        return readNext();
    }

    public async pipePull(path: string, stream: Multiplexer): Promise<void> {
        await this._sendCommandWithArg(Protocol.RECV, `${path}`);
        return this._readData(stream);
    }

    public async pipeStat(path: string, stream: Multiplexer): Promise<void> {
        await this._sendCommandWithArg(Protocol.STAT, `${path}`);
        const reply = await this.parser.readAscii(4);
        switch (reply) {
            case Protocol.STAT:
                const stat = await this.parser.readBytes(12);
                stream.send(Buffer.concat([Buffer.from(reply), stat]));
                stream.close(1000);
                break;
            case Protocol.FAIL:
                return this._readError(stream);
            default:
                return this.parser.unexpected(reply, 'STAT or FAIL');
        }
    }

    private _readData(stream: Multiplexer): Promise<void> {
        const readNext = async (): Promise<void> => {
            const reply = await this.parser.readAscii(4);
            switch (reply) {
                case Protocol.DATA:
                    const lengthData = await this.parser.readBytes(4);
                    const length = lengthData.readUInt32LE(0);
                    const data = await this.parser.readBytes(length);
                    stream.send(Buffer.concat([Buffer.from(reply), data]));
                    return readNext();
                case Protocol.DONE:
                    await this.parser.readBytes(4);
                    stream.close(1000);
                    return;
                case Protocol.FAIL:
                    return this._readError(stream);
                default:
                    return this.parser.unexpected(reply, 'DATA, DONE or FAIL');
            }
        };
        return readNext();
    }

    private async _sendCommandWithArg(cmd: string, arg: string): Promise<void> {
        const arglen = Buffer.byteLength(arg, 'utf-8');
        const payload = Buffer.alloc(cmd.length + 4 + arglen);
        let pos = 0;
        payload.write(cmd, pos, cmd.length);
        pos += cmd.length;
        payload.writeUInt32LE(arglen, pos);
        pos += 4;
        payload.write(arg, pos);
        await this.connection.write(payload);
    }

    private async _readError(stream: Multiplexer): Promise<void> {
        const length = await this.parser.readBytes(4);
        const message = await this.parser.readAscii(length.readUInt32LE(0));
        stream.close(4000, message);
        await this.parser.end();
        return;
    }

    public end(): ExtendedSync {
        this.connection.end();
        return this;
    }
}
