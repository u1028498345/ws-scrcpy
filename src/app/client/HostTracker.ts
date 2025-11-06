import { ManagerClient } from './ManagerClient';
import { Message } from '../../types/Message';
import { MessageError, MessageHosts, MessageType } from '../../common/HostTrackerMessage';
import { ACTION } from '../../common/Action';
import { DeviceTracker as GoogDeviceTracker } from '../googDevice/client/DeviceTracker';
import { DeviceTracker as ApplDeviceTracker } from '../applDevice/client/DeviceTracker';
import { ParamsBase } from '../../types/ParamsBase';
import { HostItem } from '../../types/Configuration';
import { ChannelCode } from '../../common/ChannelCode';
import { SERVICE_HOST, SERVICE_PORT } from '../../common/Constants';

const TAG = '[HostTracker]';

export interface HostTrackerEvents {
    // hosts: HostItem[];
    disconnected: CloseEvent;
    error: string;
}

export class HostTracker extends ManagerClient<ParamsBase, HostTrackerEvents> {
    private static instance?: HostTracker;
    private retryCount = 0;
    private maxRetries = 3;

    public static start(): void {
        this.getInstance();
    }

    public static getInstance(): HostTracker {
        if (!this.instance) {
            this.instance = new HostTracker();
        }
        return this.instance;
    }

    private trackers: Array<GoogDeviceTracker | ApplDeviceTracker> = [];

    constructor() {
        // 明确指定WebSocket服务器地址，支持多种连接方式
        super({
            action: ACTION.LIST_HOSTS,
            hostname: SERVICE_HOST,
            port: SERVICE_PORT, // WebSocket服务器端口
            secure: window.location.protocol === 'https:',
        });
        console.log('[HostTracker] Connecting to WebSocket server at:', this.url.toString());
        this.openNewConnection();
        if (this.ws) {
            this.ws.binaryType = 'arraybuffer';
        }
    }

    protected onSocketOpen(): void {
        console.log('[HostTracker] WebSocket connection opened');
        // 重置重试计数
        this.retryCount = 0;
    }

    protected onSocketClose(ev: CloseEvent): void {
        console.log(TAG, 'WS closed with code:', ev.code, 'reason:', ev.reason);

        // 增加重试机制
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(TAG, `Retrying connection (${this.retryCount}/${this.maxRetries})...`);

            // 尝试不同的主机名
            const hostnames = ['', 'localhost', '127.0.0.1', window.location.hostname];
            const currentHostname = this.params.hostname || window.location.hostname;
            const currentIndex = hostnames.indexOf(currentHostname);
            const nextIndex = (currentIndex + 1) % hostnames.length;
            this.params.hostname = hostnames[nextIndex];

            console.log(TAG, 'Trying hostname:', this.params.hostname);
            this.url = this.buildWebSocketUrl();
            console.log(TAG, 'New URL:', this.url.toString());

            setTimeout(() => {
                this.openNewConnection();
            }, 1000 * this.retryCount); // 递增延迟
        } else {
            console.error(TAG, 'Max retries reached, giving up');
            this.emit('disconnected', ev);
        }
    }

    protected onSocketMessage(event: MessageEvent): void {
        let message: Message;
        try {
            // TODO: rewrite to binary
            message = JSON.parse(event.data);
        } catch (error: any) {
            console.error(TAG, error.message);
            console.log(TAG, error.data);
            return;
        }
        console.log(TAG, 'Received message:', message);
        switch (message.type) {
            case MessageType.ERROR: {
                const msg = message as MessageError;
                console.error(TAG, msg.data);
                this.emit('error', msg.data);
                break;
            }
            case MessageType.HOSTS: {
                const msg = message as MessageHosts;
                // this.emit('hosts', msg.data);
                if (msg.data.local) {
                    msg.data.local.forEach(({ type }) => {
                        console.log(type);
                        const secure = location.protocol === 'https:';
                        const port = SERVICE_PORT;
                        const hostname = SERVICE_HOST;
                        const pathname = location.pathname;
                        if (type !== 'android' && type !== 'ios') {
                            console.warn(TAG, `Unsupported host type: "${type}"`);
                            return;
                        }
                        const hostItem: HostItem = { useProxy: false, secure, port, hostname, pathname, type };
                        this.startTracker(hostItem);
                    });
                }
                if (msg.data.remote) {
                    msg.data.remote.forEach((item) => this.startTracker(item));
                }
                break;
            }
            default:
                console.log(TAG, `Unknown message type: ${message.type}`);
        }
    }

    private startTracker(hostItem: HostItem): void {
        switch (hostItem.type) {
            case 'android':
                this.trackers.push(GoogDeviceTracker.start(hostItem));
                break;
            case 'ios':
                this.trackers.push(ApplDeviceTracker.start(hostItem));
                break;
            default:
                console.warn(TAG, `Unsupported host type: "${hostItem.type}"`);
        }
    }

    public destroy(): void {
        super.destroy();
        this.trackers.forEach((tracker) => {
            tracker.destroy();
        });
        this.trackers.length = 0;
    }

    protected supportMultiplexing(): boolean {
        return true;
    }

    protected getChannelInitData(): Buffer {
        const buffer = Buffer.alloc(4);
        buffer.write(ChannelCode.HSTS, 'ascii');
        return buffer;
    }
}
