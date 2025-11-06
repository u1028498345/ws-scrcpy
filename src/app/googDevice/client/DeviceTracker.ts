import '../../../style/devicelist.css';
import { BaseDeviceTracker } from '../../client/BaseDeviceTracker';
import { SERVER_PORT } from '../../../common/Constants';
import { ACTION } from '../../../common/Action';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { ControlCenterCommand } from '../../../common/ControlCenterCommand';
import { StreamClientScrcpy } from './StreamClientScrcpy';
import SvgImage from '../../ui/SvgImage';
import { html } from '../../ui/HtmlTag';
import Util from '../../Util';
import { Attribute } from '../../Attribute';
import { DeviceState } from '../../../common/DeviceState';
import { Message } from '../../../types/Message';
import { ParamsDeviceTracker } from '../../../types/ParamsDeviceTracker';
import { HostItem } from '../../../types/Configuration';
import { ChannelCode } from '../../../common/ChannelCode';
import { Tool } from '../../client/Tool';

type Field = keyof GoogDeviceDescriptor | ((descriptor: GoogDeviceDescriptor) => string);
type DescriptionColumn = { title: string; field: Field };

const DESC_COLUMNS: DescriptionColumn[] = [
    {
        title: 'Net Interface',
        field: 'interfaces',
    },
    {
        title: 'Server PID',
        field: 'pid',
    },
];

export class DeviceTracker extends BaseDeviceTracker<GoogDeviceDescriptor, never> {
    public static readonly ACTION = ACTION.GOOG_DEVICE_LIST;
    public static readonly CREATE_DIRECT_LINKS = true;
    private static instancesByUrl: Map<string, DeviceTracker> = new Map();
    protected static tools: Set<Tool> = new Set();
    protected tableId = 'goog_device_list';

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

    protected constructor(params: HostItem, directUrl: string) {
        super({ ...params, action: DeviceTracker.ACTION }, directUrl);
        DeviceTracker.instancesByUrl.set(directUrl, this);
        this.buildDeviceTable();
        this.openNewConnection();
    }

    protected onSocketOpen(): void {
        // nothing here;
    }

    protected setIdAndHostName(id: string, hostName: string): void {
        super.setIdAndHostName(id, hostName);
        for (const value of DeviceTracker.instancesByUrl.values()) {
            if (value.id === id && value !== this) {
                console.warn(
                    `Tracker with url: "${this.url}" has the same id(${this.id}) as tracker with url "${value.url}"`,
                );
                console.warn(`This tracker will shut down`);
                this.destroy();
            }
        }
    }

    onInterfaceSelected = (event: Event): void => {
        const selectElement = event.currentTarget as HTMLSelectElement;
        const option = selectElement.selectedOptions[0];
        const url = decodeURI(option.getAttribute(Attribute.URL) || '');
        const name = option.getAttribute(Attribute.NAME) || '';
        const fullName = decodeURIComponent(selectElement.getAttribute(Attribute.FULL_NAME) || '');
        const udid = selectElement.getAttribute(Attribute.UDID) || '';
        this.updateLink({ url, name, fullName, udid, store: true });
    };

    private updateLink(params: { url: string; name: string; fullName: string; udid: string; store: boolean }): void {
        const { url, name, fullName, udid, store } = params;
        const playerTds = document.getElementsByName(
            encodeURIComponent(`${DeviceTracker.AttributePrefixPlayerFor}${fullName}`),
        );
        if (typeof udid !== 'string') {
            return;
        }
        if (store) {
            const localStorageKey = DeviceTracker.getLocalStorageKey(fullName || '');
            if (localStorage && name) {
                localStorage.setItem(localStorageKey, name);
            }
        }
        const action = ACTION.STREAM_SCRCPY;
        playerTds.forEach((item) => {
            item.innerHTML = '';
            const playerFullName = item.getAttribute(DeviceTracker.AttributePlayerFullName);
            const playerCodeName = item.getAttribute(DeviceTracker.AttributePlayerCodeName);
            if (!playerFullName || !playerCodeName) {
                return;
            }
            const link = DeviceTracker.buildLink(
                {
                    action,
                    udid,
                    player: decodeURIComponent(playerCodeName),
                    ws: url,
                },
                decodeURIComponent(playerFullName),
                this.params,
            );
            item.appendChild(link);
        });
    }

    onActionButtonClick = (event: MouseEvent): void => {
        const button = event.currentTarget as HTMLButtonElement;
        const udid = button.getAttribute(Attribute.UDID);
        const pidString = button.getAttribute(Attribute.PID) || '';
        const command = button.getAttribute(Attribute.COMMAND) as string;
        const pid = parseInt(pidString, 10);
        const data: Message = {
            id: this.getNextId(),
            type: command,
            data: {
                udid: typeof udid === 'string' ? udid : undefined,
                pid: isNaN(pid) ? undefined : pid,
            },
        };

        if (this.ws && this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    };

    // 添加编辑备注的事件处理函数
    onEditRemarkClick = (event: Event): void => {
        const button = event.currentTarget as HTMLButtonElement;
        const udid = button.getAttribute(Attribute.UDID);
        if (!udid) {
            return;
        }

        // 获取当前设备
        const device = this.descriptors.find((d) => d.udid === udid);
        if (!device) {
            return;
        }

        // 创建模态对话框
        this.createRemarkModal(device);
    };

    // 创建备注编辑模态对话框
    private createRemarkModal(device: GoogDeviceDescriptor): void {
        // 移除已存在的模态框
        const existingModal = document.getElementById('remark-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const currentRemark = device.remark || '';
        const modal = html`
            <div id="remark-modal" class="remark-modal">
                <div class="remark-modal-content">
                    <div class="remark-modal-header">
                        <h3>编辑设备备注</h3>
                        <button class="remark-modal-close">&times;</button>
                    </div>
                    <div class="remark-modal-body">
                        <label for="remark-input">设备UDID: ${device.udid}</label>
                        <input
                            type="text"
                            id="remark-input"
                            class="remark-input"
                            value="${currentRemark}"
                            placeholder="请输入设备备注"
                        />
                    </div>
                    <div class="remark-modal-footer">
                        <button class="remark-modal-btn cancel-btn">取消</button>
                        <button class="remark-modal-btn save-btn">保存</button>
                    </div>
                </div>
            </div>
        `.content;

        // 添加到页面
        document.body.appendChild(modal);

        // 获取元素
        const modalElement = document.getElementById('remark-modal');
        const closeBtn = modalElement?.querySelector('.remark-modal-close');
        const cancelBtn = modalElement?.querySelector('.cancel-btn');
        const saveBtn = modalElement?.querySelector('.save-btn');
        const inputElement = modalElement?.querySelector('.remark-input') as HTMLInputElement;

        // 关闭模态框函数
        const closeModal = () => {
            if (modalElement) {
                modalElement.remove();
            }
        };

        // 保存备注函数
        const saveRemark = () => {
            const newRemark = inputElement.value.trim();

            // 如果输入的内容与当前备注相同，则不执行任何操作
            if (newRemark === (device.remark || '')) {
                closeModal();
                return;
            }

            // 发送更新备注命令到服务端
            const data: Message = {
                id: this.getNextId(),
                type: 'update_remark',
                data: {
                    udid: device.udid,
                    remark: newRemark,
                },
            };

            if (this.ws && this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify(data));
            }

            // 更新本地设备信息
            device.remark = newRemark;

            // 更新界面上显示的备注
            const deviceElements = document.querySelectorAll(`[data-udid="${device.udid}"]`);
            deviceElements.forEach((element) => {
                const serialDiv = element.closest('.device')?.querySelector('.device-serial');
                if (serialDiv) {
                    serialDiv.textContent = newRemark || device.udid;
                }
            });

            closeModal();
        };

        // 绑定事件
        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        saveBtn?.addEventListener('click', saveRemark);

        // 回车键保存
        inputElement?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveRemark();
            }
        });

        // 点击模态框外部关闭
        modalElement?.addEventListener('click', (e) => {
            if (e.target === modalElement) {
                closeModal();
            }
        });

        // 聚焦到输入框
        inputElement?.focus();
    }

    // 添加清除备注的事件处理函数
    onClearRemarkClick = (event: Event): void => {
        const button = event.currentTarget as HTMLButtonElement;
        const udid = button.getAttribute(Attribute.UDID);
        if (!udid) {
            return;
        }

        // 获取当前设备
        const device = this.descriptors.find((d) => d.udid === udid);
        if (!device) {
            return;
        }

        // 创建确认对话框
        this.createConfirmModal({
            title: '清除备注',
            message: `确定要清除设备 ${device.udid} 的备注吗？`,
            confirmText: '清除',
            cancelText: '取消',
            onConfirm: () => {
                // 发送清除备注命令到服务端
                const data: Message = {
                    id: this.getNextId(),
                    type: 'update_remark',
                    data: {
                        udid: udid,
                        remark: '',
                    },
                };

                if (this.ws && this.ws.readyState === this.ws.OPEN) {
                    this.ws.send(JSON.stringify(data));
                }

                // 更新本地设备信息
                device.remark = '';

                // 更新界面上显示的备注
                const deviceElement = button.closest('.device');
                if (deviceElement) {
                    const serialDiv = deviceElement.querySelector('.device-serial');
                    if (serialDiv) {
                        serialDiv.textContent = udid;
                    }
                }
            },
        });
    };

    // 添加删除设备的事件处理函数
    onDeleteDeviceClick = (event: Event): void => {
        const button = event.currentTarget as HTMLButtonElement;
        const udid = button.getAttribute(Attribute.UDID);
        if (!udid) {
            return;
        }

        // 获取当前设备
        const device = this.descriptors.find((d) => d.udid === udid);
        if (!device) {
            return;
        }

        // 创建确认对话框
        this.createConfirmModal({
            title: '删除设备',
            message: `确定要删除设备 ${udid} 吗？此操作将从列表中永久移除此设备。`,
            confirmText: '删除',
            cancelText: '取消',
            onConfirm: () => {
                // 发送删除设备命令到服务端
                const data: Message = {
                    id: this.getNextId(),
                    type: ControlCenterCommand.REMOVE_DEVICE,
                    data: {
                        udid: udid,
                    },
                };

                if (this.ws && this.ws.readyState === this.ws.OPEN) {
                    this.ws.send(JSON.stringify(data));
                }

                // 从前端界面中移除设备
                const deviceElement = button.closest('.device');
                if (deviceElement) {
                    deviceElement.remove();
                }

                // 从内部描述符数组中移除设备
                const index = this.descriptors.findIndex((descriptor) => descriptor.udid === udid);
                if (index !== -1) {
                    this.descriptors.splice(index, 1);
                }
            },
        });
    };

    // 创建通用确认模态对话框
    private createConfirmModal(options: {
        title: string;
        message: string;
        confirmText: string;
        cancelText: string;
        onConfirm: () => void;
    }): void {
        // 移除已存在的模态框
        const existingModal = document.getElementById('confirm-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const { title, message, confirmText, cancelText, onConfirm } = options;

        const modal = html`
            <div id="confirm-modal" class="remark-modal">
                <div class="remark-modal-content">
                    <div class="remark-modal-header">
                        <h3>${title}</h3>
                        <button class="remark-modal-close">&times;</button>
                    </div>
                    <div class="remark-modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="remark-modal-footer">
                        <button class="remark-modal-btn cancel-btn">${cancelText}</button>
                        <button class="remark-modal-btn save-btn confirm-btn">${confirmText}</button>
                    </div>
                </div>
            </div>
        `.content;

        // 添加到页面
        document.body.appendChild(modal);

        // 获取元素
        const modalElement = document.getElementById('confirm-modal');
        const closeBtn = modalElement?.querySelector('.remark-modal-close');
        const cancelBtn = modalElement?.querySelector('.cancel-btn');
        const confirmBtn = modalElement?.querySelector('.confirm-btn');

        // 关闭模态框函数
        const closeModal = () => {
            if (modalElement) {
                modalElement.remove();
            }
        };

        // 绑定事件
        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        confirmBtn?.addEventListener('click', () => {
            onConfirm();
            closeModal();
        });

        // 点击模态框外部关闭
        modalElement?.addEventListener('click', (e) => {
            if (e.target === modalElement) {
                closeModal();
            }
        });
    }

    private static getLocalStorageKey(udid: string): string {
        return `device_list::${udid}::interface`;
    }

    protected static createUrl(params: ParamsDeviceTracker, udid = ''): URL {
        const secure = !!params.secure;
        const hostname = params.hostname || location.hostname;
        const port = typeof params.port === 'number' ? params.port : secure ? 443 : 80;
        const pathname = params.pathname || location.pathname;
        const urlObject = this.buildUrl({ ...params, secure, hostname, port, pathname });
        if (udid) {
            urlObject.searchParams.set('action', ACTION.PROXY_ADB);
            urlObject.searchParams.set('remote', `tcp:${SERVER_PORT.toString(10)}`);
            urlObject.searchParams.set('udid', udid);
        }
        return urlObject;
    }

    protected static createInterfaceOption(name: string, url: string): HTMLOptionElement {
        const optionElement = document.createElement('option');
        optionElement.setAttribute(Attribute.URL, url);
        optionElement.setAttribute(Attribute.NAME, name);
        optionElement.innerText = `proxy over adb`;
        return optionElement;
    }

    private static titleToClassName(title: string): string {
        return title.toLowerCase().replace(/\s/g, '_');
    }

    protected buildDeviceRow(tbody: Element, device: GoogDeviceDescriptor): void {
        // 如果设备状态为"removed"，则不显示
        if (device.state === 'removed') {
            return;
        }

        let selectedInterfaceUrl = '';
        let selectedInterfaceName = '';
        const blockClass = 'desc-block';
        const fullName = `${this.id}_${Util.escapeUdid(device.udid)}`;
        const isActive = device.state === DeviceState.DEVICE || device.state === DeviceState.CONNECTED;
        let hasPid = false;
        const servicesId = `device_services_${fullName}`;
        const row = html`<div class="device ${isActive ? 'active' : 'not-active'}" data-udid="${device.udid}">
            <div class="device-header">
                <div class="device-name">${device['ro.product.manufacturer']} ${device['ro.product.model']}</div>
                <div class="device-serial-container">
                    <div class="device-serial">${device.remark || device.udid}</div>
                    <div class="device-remark-actions">
                        <button class="remark-action-btn edit-remark" title="编辑备注">
                            <svg width="14" height="14" viewBox="0 0 24 24">
                                <path
                                    d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                                ></path>
                            </svg>
                        </button>
                        <button class="remark-action-btn clear-remark" title="清除备注">
                            <svg width="14" height="14" viewBox="0 0 24 24">
                                <path
                                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                                ></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="device-version">
                    <div class="release-version">${device['ro.build.version.release']}</div>
                    <div class="sdk-version">${device['ro.build.version.sdk']}</div>
                </div>
                <div class="device-state" title="State: ${device.state}"></div>
                <!-- 添加删除按钮 -->
                <button class="action-button delete-device-button" title="删除设备">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path>
                    </svg>
                </button>
            </div>
            <div id="${servicesId}" class="services"></div>
        </div>`.content;
        const services = row.getElementById(servicesId);
        if (!services) {
            return;
        }

        // 为删除按钮添加事件监听器
        const deleteButton = row.querySelector('.delete-device-button');
        if (deleteButton) {
            deleteButton.setAttribute(Attribute.UDID, device.udid);
            deleteButton.addEventListener('click', this.onDeleteDeviceClick);
        }

        // 为编辑备注按钮添加事件监听器
        const editRemarkButton = row.querySelector('.edit-remark');
        if (editRemarkButton) {
            editRemarkButton.setAttribute(Attribute.UDID, device.udid);
            editRemarkButton.addEventListener('click', this.onEditRemarkClick);
        }

        // 为清除备注按钮添加事件监听器
        const clearRemarkButton = row.querySelector('.clear-remark');
        if (clearRemarkButton) {
            clearRemarkButton.setAttribute(Attribute.UDID, device.udid);
            clearRemarkButton.addEventListener('click', this.onClearRemarkClick);
        }
        DeviceTracker.tools.forEach((tool) => {
            const entry = tool.createEntryForDeviceList(device, blockClass, this.params);
            if (entry) {
                if (Array.isArray(entry)) {
                    entry.forEach((item) => {
                        item && services.appendChild(item);
                    });
                } else {
                    services.appendChild(entry);
                }
            }
        });

        const streamEntry = StreamClientScrcpy.createEntryForDeviceList(device, blockClass, fullName, this.params);
        streamEntry && services.appendChild(streamEntry);

        DESC_COLUMNS.forEach((item) => {
            const { title } = item;
            const fieldName = item.field;
            let value: string;
            if (typeof item.field === 'string') {
                value = '' + device[item.field];
            } else {
                value = item.field(device);
            }
            const td = document.createElement('div');
            td.classList.add(DeviceTracker.titleToClassName(title), blockClass);
            services.appendChild(td);
            if (fieldName === 'pid') {
                hasPid = value !== '-1';
                const actionButton = document.createElement('button');
                actionButton.className = 'action-button kill-server-button';
                actionButton.setAttribute(Attribute.UDID, device.udid);
                actionButton.setAttribute(Attribute.PID, value);
                let command: string;
                if (isActive) {
                    actionButton.classList.add('active');
                    actionButton.onclick = this.onActionButtonClick;
                    if (hasPid) {
                        command = ControlCenterCommand.KILL_SERVER;
                        actionButton.title = 'Kill server';
                        actionButton.appendChild(SvgImage.create(SvgImage.Icon.CANCEL));
                    } else {
                        command = ControlCenterCommand.START_SERVER;
                        actionButton.title = 'Start server';
                        actionButton.appendChild(SvgImage.create(SvgImage.Icon.REFRESH));
                    }
                    actionButton.setAttribute(Attribute.COMMAND, command);
                } else {
                    const timestamp = device['last.update.timestamp'];
                    if (timestamp) {
                        const date = new Date(timestamp);
                        actionButton.title = `Last update on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
                    } else {
                        actionButton.title = `Not active`;
                    }
                    actionButton.appendChild(SvgImage.create(SvgImage.Icon.OFFLINE));
                }
                const span = document.createElement('span');
                span.innerText = value;
                actionButton.appendChild(span);
                td.appendChild(actionButton);
            } else if (fieldName === 'interfaces') {
                const proxyInterfaceUrl = DeviceTracker.createUrl(this.params, device.udid).toString();
                const proxyInterfaceName = 'proxy';
                const localStorageKey = DeviceTracker.getLocalStorageKey(fullName);
                const lastSelected = localStorage && localStorage.getItem(localStorageKey);
                const selectElement = document.createElement('select');
                selectElement.setAttribute(Attribute.UDID, device.udid);
                selectElement.setAttribute(Attribute.FULL_NAME, fullName);
                selectElement.setAttribute(
                    'name',
                    encodeURIComponent(`${DeviceTracker.AttributePrefixInterfaceSelectFor}${fullName}`),
                );
                /// #if SCRCPY_LISTENS_ON_ALL_INTERFACES
                device.interfaces.forEach((value) => {
                    const params = {
                        ...this.params,
                        secure: false,
                        hostname: value.ipv4,
                        port: SERVER_PORT,
                    };
                    const url = DeviceTracker.createUrl(params).toString();
                    const optionElement = DeviceTracker.createInterfaceOption(value.name, url);
                    optionElement.innerText = `${value.name}: ${value.ipv4}`;
                    selectElement.appendChild(optionElement);
                    if (lastSelected) {
                        if (lastSelected === value.name || !selectedInterfaceName) {
                            optionElement.selected = true;
                            selectedInterfaceUrl = url;
                            selectedInterfaceName = value.name;
                        }
                    } else if (device['wifi.interface'] === value.name) {
                        optionElement.selected = true;
                        selectedInterfaceUrl = url;
                        selectedInterfaceName = value.name;
                    }
                });
                /// #else
                selectedInterfaceUrl = proxyInterfaceUrl;
                selectedInterfaceName = proxyInterfaceName;
                td.classList.add('hidden');
                /// #endif
                if (device.state === DeviceState.DEVICE) {
                    const adbProxyOption = DeviceTracker.createInterfaceOption(proxyInterfaceName, proxyInterfaceUrl);
                    if (lastSelected === proxyInterfaceName || !selectedInterfaceName) {
                        adbProxyOption.selected = true;
                        selectedInterfaceUrl = proxyInterfaceUrl;
                        selectedInterfaceName = proxyInterfaceName;
                    }
                    selectElement.appendChild(adbProxyOption);
                    const actionButton = document.createElement('button');
                    actionButton.className = 'action-button update-interfaces-button active';
                    actionButton.title = `Update information`;
                    actionButton.appendChild(SvgImage.create(SvgImage.Icon.REFRESH));
                    actionButton.setAttribute(Attribute.UDID, device.udid);
                    actionButton.setAttribute(Attribute.COMMAND, ControlCenterCommand.UPDATE_INTERFACES);
                    actionButton.onclick = this.onActionButtonClick;
                    td.appendChild(actionButton);
                }
                selectElement.onchange = this.onInterfaceSelected;
                td.appendChild(selectElement);
            } else {
                td.innerText = value;
            }
        });

        if (DeviceTracker.CREATE_DIRECT_LINKS) {
            const name = `${DeviceTracker.AttributePrefixPlayerFor}${fullName}`;
            StreamClientScrcpy.getPlayers().forEach((playerClass) => {
                const { playerCodeName, playerFullName } = playerClass;
                const playerTd = document.createElement('div');
                playerTd.classList.add(blockClass);
                playerTd.setAttribute('name', encodeURIComponent(name));
                playerTd.setAttribute(DeviceTracker.AttributePlayerFullName, encodeURIComponent(playerFullName));
                playerTd.setAttribute(DeviceTracker.AttributePlayerCodeName, encodeURIComponent(playerCodeName));
                services.appendChild(playerTd);
            });
        }

        tbody.appendChild(row);
        if (DeviceTracker.CREATE_DIRECT_LINKS && selectedInterfaceUrl) {
            this.updateLink({
                url: selectedInterfaceUrl,
                name: selectedInterfaceName,
                fullName,
                udid: device.udid,
                store: false,
            });
        }
    }

    protected getChannelCode(): string {
        return ChannelCode.GTRC;
    }

    public destroy(): void {
        super.destroy();
        DeviceTracker.instancesByUrl.delete(this.url.toString());
        if (!DeviceTracker.instancesByUrl.size) {
            const holder = document.getElementById(BaseDeviceTracker.HOLDER_ELEMENT_ID);
            if (holder && holder.parentElement) {
                holder.parentElement.removeChild(holder);
            }
        }
    }
}
