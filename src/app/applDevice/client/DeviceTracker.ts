import '../../../style/devicelist.css';
import { BaseDeviceTracker } from '../../client/BaseDeviceTracker';
import { ACTION } from '../../../common/Action';
import ApplDeviceDescriptor from '../../../types/ApplDeviceDescriptor';
import Util from '../../Util';
import { html } from '../../ui/HtmlTag';
import { DeviceState } from '../../../common/DeviceState';
import { HostItem } from '../../../types/Configuration';
import { ChannelCode } from '../../../common/ChannelCode';
import { Tool } from '../../client/Tool';

export class DeviceTracker extends BaseDeviceTracker<ApplDeviceDescriptor, never> {
    public static ACTION = ACTION.APPL_DEVICE_LIST;
    protected static tools: Set<Tool> = new Set();
    private static instancesByUrl: Map<string, DeviceTracker> = new Map();

    public static start(hostItem: HostItem): DeviceTracker {
        const url = this.buildUrlForTracker(hostItem).toString();
        let instance = this.instancesByUrl.get(url);
        if (!instance) {
            instance = new DeviceTracker(hostItem, url);
        }
        return instance;
    }

    public static getInstance(hostItem: HostItem): DeviceTracker {
        return this.start(hostItem);
    }
    protected tableId = 'appl_devices_list';
    constructor(params: HostItem, directUrl: string) {
        super({ ...params, action: DeviceTracker.ACTION }, directUrl);
        DeviceTracker.instancesByUrl.set(directUrl, this);
        this.buildDeviceTable();
        this.openNewConnection();
    }

    protected onSocketOpen(): void {
        // do nothing;
    }

    protected buildDeviceRow(tbody: Element, device: ApplDeviceDescriptor): void {
        const title = `${device.name || device.model || 'iOS Device'}`;
        const description = `${device.model || 'unknown'} · ${device.udid}`;
        this.getGroupContainer(tbody, device).appendChild(this.createDeviceTreeNode(device, title, description));
    }

    protected buildDeviceDetail(parent: HTMLElement, device: ApplDeviceDescriptor): void {
        // const blockClass = 'detail-action';
        const fullName = `${this.id}_${Util.escapeUdid(device.udid)}`;
        const isActive = device.state === DeviceState.CONNECTED;
        const groupId = `device_group_detail_${fullName}`;
        const row = html`<div class="device-detail-card ${isActive ? 'active' : 'not-active'}">
            <div class="device-header">
                <button class="operation-close-btn" type="button" title="关闭投射" aria-label="关闭投射">×</button>
                <div class="device-name">${device.name || 'iOS Device'}</div>
                <div class="device-model">${device.model}</div>
                <div class="device-serial">${device.udid}</div>
                <div class="device-version">
                    <div class="release-version">${device.version}</div>
                </div>
                <div class="device-state" title="State: ${device.state}"></div>
                <div id="${groupId}" class="device-group-control"></div>
            </div>
            <div class="device-detail-fields">
                <div><span>类型</span><strong>iOS</strong></div>
                <div><span>状态</span><strong>${device.state}</strong></div>
                <div><span>版本</span><strong>${device.version}</strong></div>
                <div><span>UDID</span><strong>${device.udid}</strong></div>
            </div>
        </div>`.content;
        // const services = row.querySelector('.device-detail-actions');
        const groupControl = row.getElementById(groupId);
        groupControl?.appendChild(this.createGroupSelect(device));

        // DeviceTracker.tools.forEach((tool) => {
        //     const entry = tool.createEntryForDeviceList(device, blockClass, this.params);
        //     if (entry) {
        //         if (Array.isArray(entry)) {
        //             entry.forEach((item) => {
        //                 item && services.appendChild(item);
        //             });
        //         } else {
        //             services.appendChild(entry);
        //         }
        //     }
        // });
        parent.appendChild(row);
    }

    protected getChannelCode(): string {
        return ChannelCode.ATRC;
    }
}
