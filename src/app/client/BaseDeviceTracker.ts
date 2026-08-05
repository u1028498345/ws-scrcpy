import { ManagerClient } from './ManagerClient';
import { Message } from '../../types/Message';
import { BaseDeviceDescriptor } from '../../types/BaseDeviceDescriptor';
import { DeviceTrackerEvent } from '../../types/DeviceTrackerEvent';
import { DeviceTrackerEventList } from '../../types/DeviceTrackerEventList';
import { html } from '../ui/HtmlTag';
import { ParamsDeviceTracker } from '../../types/ParamsDeviceTracker';
import { HostItem } from '../../types/Configuration';
import { Tool } from './Tool';
import Util from '../Util';
import { EventMap } from '../../common/TypedEmitter';

const TAG = '[BaseDeviceTracker]';

interface DeviceGroupState {
    version: 1;
    groups: string[];
    assignments: Record<string, string>;
}

type DeviceGroupSection = {
    body: HTMLElement;
    count: HTMLElement;
};

type ConfirmOptions = {
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void;
};

export abstract class BaseDeviceTracker<DD extends BaseDeviceDescriptor, TE extends EventMap> extends ManagerClient<
    ParamsDeviceTracker,
    TE
> {
    public static readonly ACTION_LIST = 'devicelist';
    public static readonly ACTION_DEVICE = 'device';
    public static readonly HOLDER_ELEMENT_ID = 'devices';
    public static readonly AttributePrefixInterfaceSelectFor = 'interface_select_for_';
    public static readonly AttributePlayerFullName = 'data-player-full-name';
    public static readonly AttributePlayerCodeName = 'data-player-code-name';
    public static readonly AttributePrefixPlayerFor = 'player_for_';
    protected static tools: Set<Tool> = new Set();
    protected static instanceId = 0;
    private static readonly UngroupedGroupName = '';
    private static readonly UngroupedGroupLabel = '未分组';

    public static registerTool(tool: Tool): void {
        this.tools.add(tool);
    }

    public static buildUrl(item: HostItem): URL {
        const { secure, port, hostname } = item;
        const pathname = item.pathname ?? '/';
        const protocol = secure ? 'wss:' : 'ws:';
        const url = new URL(`${protocol}//${hostname}${pathname}`);
        if (port) {
            url.port = port.toString();
        }
        return url;
    }

    public static buildUrlForTracker(params: HostItem): URL {
        const wsUrl = this.buildUrl(params);
        wsUrl.searchParams.set('action', this.ACTION);
        return wsUrl;
    }

    public static buildLink(q: any, text: string, params: ParamsDeviceTracker): HTMLAnchorElement {
        let hostname = location.hostname;
        let port: string | number | undefined = location.port;
        let pathname = params.pathname ?? location.pathname;
        let protocol = params.secure ? 'https:' : 'http:';
        if (params.useProxy) {
            q.hostname = hostname;
            q.port = port;
            q.pathname = pathname;
            q.secure = params.secure;
            q.useProxy = true;
            protocol = location.protocol;
            hostname = location.hostname;
            port = location.port;
            pathname = location.pathname;
        }
        const hash = `#!${new URLSearchParams(q).toString()}`;
        const a = document.createElement('a');
        a.setAttribute('href', `${protocol}//${hostname}:${port}${pathname}${hash}`);
        a.setAttribute('rel', 'noopener noreferrer');
        a.setAttribute('target', '_blank');
        a.classList.add(`link-${q.action}`);
        a.innerText = text;
        return a;
    }

    protected title = 'Device list';
    protected tableId = 'base_device_list';
    protected descriptors: DD[] = [];
    protected elementId: string;
    protected trackerName = '';
    protected id = '';
    protected readonly directUrl: string;
    private created = false;
    private messageId = 0;
    private readonly groupStorageKey: string;
    private groupState: DeviceGroupState;
    private groupDraft = '';
    private groupSections: Map<string, DeviceGroupSection> = new Map();
    private selectedUdid = '';
    private operationFrame?: HTMLIFrameElement;
    private operationCanvas?: HTMLElement;
    private operationUrl = '';

    protected constructor(params: ParamsDeviceTracker, directUrl: string) {
        super(params);
        this.directUrl = directUrl;
        this.elementId = `tracker_instance${++BaseDeviceTracker.instanceId}`;
        this.trackerName = `Unavailable. Host: ${params.hostname}, type: ${params.type}`;
        this.groupStorageKey = BaseDeviceTracker.buildGroupStorageKey(directUrl);
        this.groupState = this.loadGroupState();
        this.setBodyClass('list');
        this.setTitle();
    }

    private static buildGroupStorageKey(directUrl: string): string {
        return `device_list::groups::${encodeURIComponent(directUrl)}`;
    }

    public static parseParameters(params: URLSearchParams): ParamsDeviceTracker {
        const typedParams = super.parseParameters(params);
        const type = Util.parseString(params, 'type', true);
        if (type !== 'android' && type !== 'ios') {
            throw Error('Incorrect type');
        }
        return { ...typedParams, type };
    }

    protected getNextId(): number {
        return ++this.messageId;
    }

    protected buildDeviceTable(): void {
        this.groupSections.clear();
        const data = this.descriptors;
        const devices = this.getOrCreateTableHolder();
        this.renderGlobalWorkbenchHeader(devices);
        const tbody = this.getOrBuildTableBody(devices);

        const block = this.getOrCreateTrackerBlock(tbody, this.trackerName) as HTMLElement;
        this.syncSelectedDevice();
        const layout = this.getOrCreateShellElement(block, 'layout', 'device-terminal-layout');
        const sidebar = this.getOrCreateShellElement(layout, 'sidebar', 'device-terminal-sidebar');
        const toolbarSlot = this.getOrCreateShellElement(sidebar, 'toolbar_slot', 'device-sidebar-toolbar');
        const tree = this.getOrCreateShellElement(sidebar, 'tree', 'device-tree');
        tree.innerHTML = '';

        this.renderTrackerToolbar(toolbarSlot);
        this.getOrderedGroupNames().forEach((groupName) => {
            this.getOrCreateGroupSection(tree, groupName);
        });
        data.forEach((item) => {
            this.buildDeviceRow(tree, item);
        });
        this.refreshGroupSectionCounts();
        this.renderSelectedDeviceDetail(block);
    }

    private getOrCreateTrackerBlock(parent: Element, controlCenterName: string): Element {
        let el = document.getElementById(this.elementId);
        if (!el) {
            el = document.createElement('div');
            el.id = this.elementId;
            el.className = 'device-terminal-shell';
            parent.appendChild(el);
            this.created = true;
        }
        el.setAttribute('data-tracker-name', controlCenterName);
        const staleName = document.getElementById(`${this.elementId}_name`);
        staleName?.remove();
        const staleHeader = document.getElementById(`${this.elementId}_terminal_header`);
        staleHeader?.remove();
        return el;
    }

    private getOrCreateShellElement(parent: Element, suffix: string, className: string): HTMLElement {
        const id = `${this.elementId}_${suffix}`;
        let el = document.getElementById(id) as HTMLElement | null;
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = className;
            parent.appendChild(el);
        }
        return el;
    }

    private renderGlobalWorkbenchHeader(parent: HTMLElement): void {
        let header = document.getElementById(`${BaseDeviceTracker.HOLDER_ELEMENT_ID}_terminal_header`);
        if (!header) {
            header = document.createElement('header');
            header.id = `${BaseDeviceTracker.HOLDER_ELEMENT_ID}_terminal_header`;
            header.className = 'device-terminal-header';
            parent.insertBefore(header, parent.firstChild);
        }
        header.innerHTML = '';

        const titleBlock = document.createElement('div');
        titleBlock.className = 'device-terminal-title-block';

        const title = document.createElement('h1');
        title.className = 'device-terminal-title';
        title.innerText = '手机远程控制终端';

        const subtitle = document.createElement('div');
        subtitle.className = 'device-terminal-subtitle';
        subtitle.innerText = '左侧选择设备，右侧完成投射与终端操作';

        const summary = document.createElement('div');
        summary.className = 'device-terminal-summary';
        summary.innerText = '设备工作台';

        titleBlock.appendChild(title);
        titleBlock.appendChild(subtitle);
        header.appendChild(titleBlock);
        header.appendChild(summary);
    }

    private loadGroupState(): DeviceGroupState {
        const emptyState: DeviceGroupState = {
            version: 1,
            groups: [],
            assignments: {},
        };
        try {
            const storage = window.localStorage;
            if (!storage) {
                return emptyState;
            }
            const raw = storage.getItem(this.groupStorageKey);
            if (!raw) {
                return emptyState;
            }
            const parsed = JSON.parse(raw) as Partial<DeviceGroupState>;
            const groups = Array.isArray(parsed.groups)
                ? Array.from(
                      new Set(parsed.groups.map((group) => this.normalizeGroupName(group)).filter((group) => !!group)),
                  )
                : [];
            const assignments: Record<string, string> = {};
            const rawAssignments = parsed.assignments;
            if (rawAssignments && typeof rawAssignments === 'object') {
                Object.entries(rawAssignments).forEach(([udid, groupName]) => {
                    const normalizedGroup = this.normalizeGroupName(groupName);
                    if (!udid || !normalizedGroup) {
                        return;
                    }
                    if (!groups.includes(normalizedGroup)) {
                        groups.push(normalizedGroup);
                    }
                    assignments[udid] = normalizedGroup;
                });
            }
            return {
                version: 1,
                groups,
                assignments,
            };
        } catch (error) {
            console.warn(TAG, 'Failed to load device groups:', error);
            return emptyState;
        }
    }

    private saveGroupState(): void {
        try {
            const storage = window.localStorage;
            storage?.setItem(this.groupStorageKey, JSON.stringify(this.groupState));
        } catch (error) {
            console.warn(TAG, 'Failed to persist device groups:', error);
        }
    }

    private syncServerGroupState(list: DD[], groups?: string[]): void {
        const hasServerGroupState =
            Array.isArray(groups) || list.some((device) => typeof device.deviceGroup === 'string');
        if (!hasServerGroupState) {
            return;
        }

        const nextGroups = Array.isArray(groups)
            ? Array.from(new Set(groups.map((group) => this.normalizeGroupName(group)).filter((group) => !!group)))
            : [];
        const assignments: Record<string, string> = {};

        list.forEach((device) => {
            const groupName = this.normalizeGroupName(device.deviceGroup || '');
            if (!groupName) {
                return;
            }
            if (!nextGroups.includes(groupName)) {
                nextGroups.push(groupName);
            }
            assignments[device.udid] = groupName;
        });

        if (!nextGroups.length && !Object.keys(assignments).length && this.hasLocalGroupState()) {
            this.syncLocalGroupStateToServer();
            return;
        }

        this.groupState = {
            version: 1,
            groups: nextGroups,
            assignments,
        };
        this.saveGroupState();
    }

    private hasLocalGroupState(): boolean {
        return !!this.groupState.groups.length || !!Object.keys(this.groupState.assignments).length;
    }

    private syncLocalGroupStateToServer(): void {
        this.groupState.groups.forEach((groupName) => {
            this.sendGroupCommand('create_device_group', { groupName });
        });
        Object.entries(this.groupState.assignments).forEach(([udid, groupName]) => {
            this.sendGroupCommand('update_device_group', { udid, groupName });
        });
    }

    private syncServerDeviceGroup(device: DD): void {
        if (typeof device.deviceGroup !== 'string') {
            return;
        }
        const groupName = this.normalizeGroupName(device.deviceGroup);
        if (groupName && !this.groupState.groups.includes(groupName)) {
            this.groupState.groups.push(groupName);
        }
        if (groupName) {
            this.groupState.assignments[device.udid] = groupName;
        } else {
            delete this.groupState.assignments[device.udid];
        }
        this.saveGroupState();
    }

    private sendGroupCommand(type: string, data: Record<string, string>): void {
        if (!this.ws || this.ws.readyState !== this.ws.OPEN) {
            return;
        }
        const message: Message = {
            id: this.getNextId(),
            type,
            data,
        };
        this.ws.send(JSON.stringify(message));
    }

    private getDevicesInGroup(groupName: string): DD[] {
        return this.descriptors.filter((device) => this.getDeviceGroupName(device) === groupName);
    }

    private deleteGroup(groupName: string): void {
        const normalizedGroup = this.normalizeGroupName(groupName);
        if (!normalizedGroup) {
            return;
        }

        this.groupState.groups = this.groupState.groups.filter((item) => item !== normalizedGroup);
        this.descriptors.forEach((device) => {
            if (this.groupState.assignments[device.udid] !== normalizedGroup) {
                return;
            }
            delete this.groupState.assignments[device.udid];
            device.deviceGroup = '';
        });
        this.saveGroupState();
        this.sendGroupCommand('delete_device_group', { groupName: normalizedGroup });
        this.buildDeviceTable();
    }

    private onDeleteGroupClick(groupName: string): void {
        const normalizedGroup = this.normalizeGroupName(groupName);
        if (!normalizedGroup) {
            return;
        }

        const devicesInGroup = this.getDevicesInGroup(normalizedGroup);
        if (!devicesInGroup.length) {
            this.deleteGroup(normalizedGroup);
            return;
        }

        this.createGroupDeleteConfirmModal({
            title: '删除分组',
            message: `分组“${normalizedGroup}”下有 ${devicesInGroup.length} 台设备。确认删除后，这些设备会移动到未分组。`,
            confirmText: '确认删除',
            cancelText: '取消',
            onConfirm: () => {
                this.deleteGroup(normalizedGroup);
            },
        });
    }

    private createGroupDeleteConfirmModal(options: ConfirmOptions): void {
        const existingModal = document.getElementById(`${this.elementId}_group_delete_modal`);
        existingModal?.remove();

        const { title, message, confirmText, cancelText, onConfirm } = options;
        const modal = html`<div id="${this.elementId}_group_delete_modal" class="remark-modal">
            <div class="remark-modal-content">
                <div class="remark-modal-header">
                    <h3>${title}</h3>
                    <button class="remark-modal-close" type="button" aria-label="关闭">&times;</button>
                </div>
                <div class="remark-modal-body">
                    <p>${message}</p>
                </div>
                <div class="remark-modal-footer">
                    <button class="remark-modal-btn cancel-btn" type="button">${cancelText}</button>
                    <button class="remark-modal-btn confirm-btn" type="button">${confirmText}</button>
                </div>
            </div>
        </div>`.content;

        document.body.appendChild(modal);
        const modalElement = document.getElementById(`${this.elementId}_group_delete_modal`);
        const closeModal = (): void => {
            modalElement?.remove();
        };

        modalElement?.querySelector('.remark-modal-close')?.addEventListener('click', closeModal);
        modalElement?.querySelector('.cancel-btn')?.addEventListener('click', closeModal);
        modalElement?.querySelector('.confirm-btn')?.addEventListener('click', () => {
            onConfirm();
            closeModal();
        });
        modalElement?.addEventListener('click', (event) => {
            if (event.target === modalElement) {
                closeModal();
            }
        });
    }

    private normalizeGroupName(value: unknown): string {
        if (typeof value !== 'string') {
            return '';
        }
        return value.trim().replace(/\s+/g, ' ');
    }

    private getOrderedGroupNames(): string[] {
        return [BaseDeviceTracker.UngroupedGroupName, ...this.groupState.groups];
    }

    protected getDeviceGroupName(device: DD): string {
        return this.groupState.assignments[device.udid] || BaseDeviceTracker.UngroupedGroupName;
    }

    protected getGroupLabel(groupName: string): string {
        return groupName || BaseDeviceTracker.UngroupedGroupLabel;
    }

    private createGroupInput(): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tracker-group-input';
        input.placeholder = '新建分组';
        input.maxLength = 32;
        input.value = this.groupDraft;
        input.addEventListener('input', () => {
            this.groupDraft = input.value;
        });
        return input;
    }

    protected renderTrackerToolbar(parent: Element): void {
        let toolbar = document.getElementById(`${this.elementId}_group_toolbar`);
        if (toolbar) {
            toolbar.remove();
        }
        toolbar = document.createElement('div');
        toolbar.id = `${this.elementId}_group_toolbar`;
        toolbar.className = 'tracker-toolbar';

        const summary = document.createElement('div');
        summary.className = 'tracker-toolbar-summary';
        summary.innerText = '设备分组';

        const form = document.createElement('div');
        form.className = 'tracker-group-form';

        const input = this.createGroupInput();
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'tracker-group-add-button';
        addButton.title = '新建分组';
        addButton.setAttribute('aria-label', '新建分组');
        addButton.innerText = '+';

        const commitGroup = (): void => {
            const groupName = this.normalizeGroupName(input.value);
            if (!groupName) {
                return;
            }
            if (!this.groupState.groups.includes(groupName)) {
                this.groupState.groups.push(groupName);
                this.saveGroupState();
                this.sendGroupCommand('create_device_group', { groupName });
            }
            this.groupDraft = '';
            this.buildDeviceTable();
        };

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commitGroup();
            }
        });
        addButton.addEventListener('click', commitGroup);

        form.appendChild(input);
        form.appendChild(addButton);
        const helper = document.createElement('div');
        helper.className = 'tracker-toolbar-helper';
        helper.innerText = '点击设备节点查看与操作';

        const toolbarHead = document.createElement('div');
        toolbarHead.className = 'tracker-toolbar-head';
        toolbarHead.appendChild(summary);
        toolbarHead.appendChild(helper);

        toolbar.appendChild(toolbarHead);
        toolbar.appendChild(form);
        parent.appendChild(toolbar);
    }

    protected getOrCreateGroupSection(parent: Element, groupName: string): HTMLElement {
        const key = groupName || BaseDeviceTracker.UngroupedGroupName;
        const existing = this.groupSections.get(key);
        if (existing) {
            return existing.body;
        }

        const root = document.createElement('section');
        root.className = 'device-group';
        root.setAttribute('data-group-name', key || 'ungrouped');

        const header = document.createElement('div');
        header.className = 'device-group-header';

        const label = document.createElement('span');
        label.className = 'device-group-label';
        label.innerText = this.getGroupLabel(groupName);

        const count = document.createElement('span');
        count.className = 'device-group-count';
        count.innerText = '0';

        header.appendChild(label);
        header.appendChild(count);

        if (groupName) {
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'device-group-delete-button';
            deleteButton.title = '删除分组';
            deleteButton.setAttribute('aria-label', `删除分组 ${groupName}`);
            deleteButton.innerText = '×';
            deleteButton.addEventListener('click', (event) => {
                event.preventDefault();
                this.onDeleteGroupClick(groupName);
            });
            header.appendChild(deleteButton);
        }

        const body = document.createElement('div');
        body.className = 'device-group-body';

        root.appendChild(header);
        root.appendChild(body);
        parent.appendChild(root);
        this.groupSections.set(key, { body, count });
        return body;
    }

    protected getGroupContainer(parent: Element, device: DD): HTMLElement {
        const groupName = this.getDeviceGroupName(device);
        return this.getOrCreateGroupSection(parent, groupName);
    }

    protected createGroupSelect(device: DD): HTMLSelectElement {
        const select = document.createElement('select');
        select.className = 'device-group-select';
        select.title = '移动到分组';

        const ungroupedOption = document.createElement('option');
        ungroupedOption.value = BaseDeviceTracker.UngroupedGroupName;
        ungroupedOption.innerText = BaseDeviceTracker.UngroupedGroupLabel;
        select.appendChild(ungroupedOption);

        this.groupState.groups.forEach((groupName) => {
            const option = document.createElement('option');
            option.value = groupName;
            option.innerText = groupName;
            select.appendChild(option);
        });

        select.value = this.getDeviceGroupName(device);
        select.addEventListener('change', () => {
            const nextGroup = this.normalizeGroupName(select.value);
            const currentGroup = this.getDeviceGroupName(device);
            if (nextGroup === currentGroup) {
                return;
            }
            if (nextGroup && !this.groupState.groups.includes(nextGroup)) {
                this.groupState.groups.push(nextGroup);
            }
            if (nextGroup) {
                this.groupState.assignments[device.udid] = nextGroup;
                device.deviceGroup = nextGroup;
            } else {
                delete this.groupState.assignments[device.udid];
                device.deviceGroup = '';
            }
            this.saveGroupState();
            this.sendGroupCommand('update_device_group', { udid: device.udid, groupName: nextGroup });
            this.buildDeviceTable();
        });
        return select;
    }

    private refreshGroupSectionCounts(): void {
        this.groupSections.forEach(({ body, count }) => {
            count.innerText = String(body.children.length);
        });
    }

    protected createDeviceTreeNode(device: DD, title: string, description: string): HTMLButtonElement {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = `device-tree-node ${device.udid === this.selectedUdid ? 'selected' : ''}`;
        node.setAttribute('data-udid', device.udid);
        node.title = device.udid;

        const status = document.createElement('span');
        status.className = `device-tree-status ${this.isDeviceActive(device) ? 'active' : 'not-active'}`;

        const text = document.createElement('span');
        text.className = 'device-tree-text';

        const name = document.createElement('span');
        name.className = 'device-tree-name';
        name.innerText = title;

        const meta = document.createElement('span');
        meta.className = 'device-tree-meta';
        meta.innerText = description;

        text.appendChild(name);
        text.appendChild(meta);
        node.appendChild(status);
        node.appendChild(text);
        node.addEventListener('click', () => {
            this.selectDevice(device.udid);
        });
        return node;
    }

    protected isDeviceSelected(device: DD): boolean {
        return device.udid === this.selectedUdid;
    }

    protected isDeviceActive(device: DD): boolean {
        return device.state === 'device' || device.state === 'connected';
    }

    private selectDevice(udid: string): void {
        if (this.selectedUdid === udid) {
            return;
        }
        this.destroyOperationFrame();
        this.selectedUdid = udid;
        this.buildDeviceTable();
    }

    private syncSelectedDevice(): void {
        if (!this.selectedUdid) {
            return;
        }
        if (!this.getDescriptorByUdid(this.selectedUdid)) {
            this.selectedUdid = '';
            this.destroyOperationFrame();
        }
    }

    private renderSelectedDeviceDetail(parent: HTMLElement): void {
        const layout = this.getOrCreateShellElement(parent, 'layout', 'device-terminal-layout');
        const main = this.getOrCreateShellElement(layout, 'main', 'device-terminal-main');
        const operation = this.getOrCreateShellElement(main, 'operation', 'device-operation-panel');
        const preservedCanvas = this.operationCanvas;
        operation.innerHTML = '';

        const selected = this.selectedUdid ? this.getDescriptorByUdid(this.selectedUdid) : undefined;
        if (!selected) {
            this.renderOperationPlaceholder(operation, '选择左侧设备后自动打开投射画面');
            return;
        }

        const info = document.createElement('div');
        info.className = 'device-operation-info';
        this.buildDeviceDetail(info, selected);
        operation.appendChild(info);
        this.bindInlineActionLinks(info);
        info.querySelector('.operation-close-btn')?.addEventListener('click', () => {
            this.destroyOperationFrame();
            this.renderOperationPlaceholder(operation, '选择左侧设备后自动打开投射画面');
        });

        if (preservedCanvas && this.operationFrame && this.operationUrl) {
            operation.appendChild(preservedCanvas);
            return;
        }

        const defaultOperation = this.getDefaultOperationLink(selected);
        if (defaultOperation) {
            this.openOperationFrame(defaultOperation.url, defaultOperation.title);
            return;
        }

        const streamLink = info.querySelector(
            'a.link-stream, a.link-stream-mjpeg, a.link-stream-qvh',
        ) as HTMLAnchorElement | null;
        if (streamLink?.href) {
            this.openOperationFrame(streamLink.href, '设备投射');
        } else {
            this.renderOperationPlaceholder(operation, '当前设备暂无可用投射入口');
        }
    }

    private bindInlineActionLinks(parent: HTMLElement): void {
        parent.querySelectorAll('a[href]').forEach((link) => {
            const anchor = link as HTMLAnchorElement;
            anchor.removeAttribute('target');
            anchor.addEventListener('click', (event) => {
                event.preventDefault();
                this.openOperationFrame(anchor.href, anchor.innerText || '设备操作');
            });
        });
    }

    private openOperationFrame(url: string, title: string): void {
        this.destroyOperationFrame();
        const main = document.getElementById(`${this.elementId}_main`) as HTMLElement | null;
        if (!main) {
            return;
        }
        const operation = this.getOrCreateShellElement(main, 'operation', 'device-operation-panel');
        operation.querySelector('.device-operation-canvas')?.remove();

        const canvas = document.createElement('div');
        canvas.className = 'device-operation-canvas';

        const frame = document.createElement('iframe');
        frame.className = 'device-operation-frame';
        frame.src = url;
        frame.title = title;
        canvas.appendChild(frame);
        operation.appendChild(canvas);
        this.operationCanvas = canvas;
        this.operationFrame = frame;
        this.operationUrl = url;
    }

    private destroyOperationFrame(): void {
        if (!this.operationFrame) {
            this.operationCanvas?.remove();
            this.operationCanvas = undefined;
            this.operationUrl = '';
            return;
        }
        this.operationFrame.src = 'about:blank';
        this.operationCanvas?.remove();
        this.operationCanvas = undefined;
        this.operationFrame = undefined;
        this.operationUrl = '';
    }

    private renderOperationPlaceholder(operation: HTMLElement, text: string): void {
        if (this.operationFrame && this.operationUrl) {
            return;
        }
        const placeholder = document.createElement('div');
        placeholder.className = 'device-operation-placeholder';
        placeholder.innerText = text;
        operation.appendChild(placeholder);
    }

    protected abstract buildDeviceRow(tbody: Element, device: DD): void;

    protected abstract buildDeviceDetail(parent: HTMLElement, device: DD): void;

    protected getDefaultOperationLink(_device: DD): { title: string; url: string } | undefined {
        void _device;
        return;
    }

    protected onSocketClose(event: CloseEvent): void {
        if (this.destroyed) {
            return;
        }
        console.log(TAG, `Connection closed: ${event.reason}`);
        setTimeout(() => {
            this.openNewConnection();
        }, 2000);
    }

    protected onSocketMessage(event: MessageEvent): void {
        let message: Message;
        try {
            message = JSON.parse(event.data);
        } catch (error: any) {
            console.error(TAG, error.message);
            console.log(TAG, error.data);
            return;
        }
        switch (message.type) {
            case BaseDeviceTracker.ACTION_LIST: {
                const event = message.data as DeviceTrackerEventList<DD>;
                this.descriptors = event.list;
                this.syncServerGroupState(event.list, event.groups);
                this.setIdAndHostName(event.id, event.name);
                this.buildDeviceTable();
                break;
            }
            case BaseDeviceTracker.ACTION_DEVICE: {
                const event = message.data as DeviceTrackerEvent<DD>;
                this.setIdAndHostName(event.id, event.name);
                this.updateDescriptor(event.device);
                this.syncServerDeviceGroup(event.device);
                this.buildDeviceTable();
                break;
            }
            default:
                console.log(TAG, `Unknown message type: ${message.type}`);
        }
    }

    protected setIdAndHostName(id: string, trackerName: string): void {
        if (this.id === id && this.trackerName === trackerName) {
            return;
        }
        this.id = id;
        this.trackerName = trackerName;
    }

    protected getOrCreateTableHolder(): HTMLElement {
        const id = BaseDeviceTracker.HOLDER_ELEMENT_ID;
        let devices = document.getElementById(id);
        if (!devices) {
            devices = document.createElement('div');
            devices.id = id;
            devices.className = 'table-wrapper';
            document.body.appendChild(devices);
        }
        return devices;
    }

    protected updateDescriptor(descriptor: DD): void {
        const idx = this.descriptors.findIndex((item: DD) => {
            return item.udid === descriptor.udid;
        });
        if (idx !== -1) {
            this.descriptors[idx] = descriptor;
        } else {
            this.descriptors.push(descriptor);
        }
    }

    protected getOrBuildTableBody(parent: HTMLElement): Element {
        const className = 'device-list';
        let tbody = document.querySelector(
            `#${BaseDeviceTracker.HOLDER_ELEMENT_ID} #${this.tableId}.${className}`,
        ) as Element;
        if (!tbody) {
            const fragment = html`<div id="${this.tableId}" class="${className}"></div>`.content;
            parent.appendChild(fragment);
            const last = parent.children.item(parent.children.length - 1);
            if (last) {
                tbody = last;
            }
        }
        return tbody;
    }

    public getDescriptorByUdid(udid: string): DD | undefined {
        if (!this.descriptors.length) {
            return;
        }
        return this.descriptors.find((descriptor: DD) => {
            return descriptor.udid === udid;
        });
    }

    public destroy(): void {
        super.destroy();
        if (this.created) {
            const el = document.getElementById(this.elementId);
            if (el) {
                const { parentElement } = el;
                el.remove();
                if (parentElement && !parentElement.children.length) {
                    parentElement.remove();
                }
            }
        }
        const holder = document.getElementById(BaseDeviceTracker.HOLDER_ELEMENT_ID);
        if (holder && !holder.children.length) {
            holder.remove();
        }
    }

    protected supportMultiplexing(): boolean {
        return true;
    }

    protected getChannelCode(): string {
        throw Error('Not implemented. Must override');
    }

    protected getChannelInitData(): Buffer {
        const code = this.getChannelCode();
        const buffer = Buffer.alloc(code.length);
        buffer.write(code, 'ascii');
        return buffer;
    }
}
