import { Optional, ToolBoxElement } from './ToolBoxElement';
import SvgImage, { Icon } from '../ui/SvgImage';

type Icons = {
    on?: Icon;
    off: Icon;
};

export class ToolBoxCheckbox extends ToolBoxElement<HTMLInputElement> {
    private readonly input: HTMLInputElement;
    private readonly label: HTMLLabelElement;
    private readonly imageOn?: Element;
    private readonly imageOff: Element;
    constructor(title: string, icons: Icons | Icon, opt_id?: string, optional?: Optional) {
        super(title, optional);
        const input = document.createElement('input');
        input.type = 'checkbox';
        const label = document.createElement('label');
        label.title = title;
        label.classList.add('control-button');
        let iconOff: Icon;
        let iconOn: Icon | undefined;
        if (typeof icons !== 'number') {
            iconOff = icons.off;
            iconOn = icons.on;
        } else {
            iconOff = icons;
        }

        // 处理关闭状态的图标
        this.imageOff = SvgImage.create(iconOff) as SVGElement;
        this.imageOff.classList.add('image', 'image-off');

        // 确保SVG图标正确居中和尺寸统一
        this.imageOff.setAttribute('width', '24');
        this.imageOff.setAttribute('height', '24');

        // 标准化viewBox，如果不存在则添加标准值
        if (!this.imageOff.hasAttribute('viewBox')) {
            this.imageOff.setAttribute('viewBox', '0 0 24 24');
        }

        // 移除可能存在的fill属性，让CSS控制颜色
        this.imageOff.removeAttribute('fill');

        // 添加额外的样式确保图标居中
        this.imageOff.setAttribute('style', 'width: 24px; height: 24px; display: block;');

        label.appendChild(this.imageOff);

        if (iconOn) {
            // 处理开启状态的图标
            this.imageOn = SvgImage.create(iconOn) as SVGElement;
            this.imageOn.classList.add('image', 'image-on');

            // 确保SVG图标正确居中和尺寸统一
            this.imageOn.setAttribute('width', '24');
            this.imageOn.setAttribute('height', '24');

            // 标准化viewBox，如果不存在则添加标准值
            if (!this.imageOn.hasAttribute('viewBox')) {
                this.imageOn.setAttribute('viewBox', '0 0 24 24');
            }

            // 移除可能存在的fill属性，让CSS控制颜色
            this.imageOn.removeAttribute('fill');

            // 添加额外的样式确保图标居中
            this.imageOn.setAttribute('style', 'width: 24px; height: 24px; display: none;');

            label.appendChild(this.imageOn);
            input.classList.add('two-images');
        }

        const id = opt_id || title.toLowerCase().replace(' ', '_');
        label.htmlFor = input.id = `input_${id}`;
        this.input = input;
        this.label = label;
    }

    public getElement(): HTMLInputElement {
        return this.input;
    }

    public getAllElements(): HTMLElement[] {
        return [this.input, this.label];
    }
}