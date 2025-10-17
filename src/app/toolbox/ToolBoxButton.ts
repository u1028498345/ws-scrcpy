import { Optional, ToolBoxElement } from './ToolBoxElement';
import SvgImage, { Icon } from '../ui/SvgImage';

export class ToolBoxButton extends ToolBoxElement<HTMLButtonElement> {
    private readonly btn: HTMLButtonElement;
    constructor(title: string, icon: Icon, optional?: Optional) {
        super(title, optional);
        const btn = document.createElement('button');
        btn.classList.add('control-button');
        btn.title = title;
        const svgIcon = SvgImage.create(icon) as SVGElement;
        
        // 确保SVG图标正确居中和尺寸统一
        svgIcon.setAttribute('width', '24');
        svgIcon.setAttribute('height', '24');
        
        // 标准化viewBox，如果不存在则添加标准值
        if (!svgIcon.hasAttribute('viewBox')) {
            svgIcon.setAttribute('viewBox', '0 0 24 24');
        }
        
        // 移除可能存在的fill属性，让CSS控制颜色
        svgIcon.removeAttribute('fill');
        
        // 添加额外的样式确保图标居中
        svgIcon.setAttribute('style', 'width: 24px; height: 24px; display: block; margin: auto;');
        
        btn.appendChild(svgIcon);
        this.btn = btn;
    }

    public getElement(): HTMLButtonElement {
        return this.btn;
    }
    public getAllElements(): HTMLElement[] {
        return [this.btn];
    }
}