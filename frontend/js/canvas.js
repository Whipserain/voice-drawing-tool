/**
 * Canvas 画布绘图模块（纯语音控制版）
 *
 * 核心设计：基于9宫格区域的绘图系统
 * 用户通过语音指定区域（如"中间"、"左上角"），系统自动计算坐标
 */

class CanvasDrawingModule {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // 绘图状态
        this.currentTool = 'pen';
        this.currentColor = '#000000';
        this.brushSize = 3;
        this.shapeSize = 60; // 形状默认大小

        // 形状追踪（用于删除功能）
        this.shapes = [];

        // 自由画笔状态
        this.isFreeDrawing = false;
        this.penX = 0;
        this.penY = 0;
        this.penStep = 15; // 每次方向命令移动的像素

        // 历史记录（用于撤销/重做）
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;

        // 临时画布（用于形状预览）
        this.tempCanvas = document.createElement('canvas');
        this.tempCtx = this.tempCanvas.getContext('2d');

        this.initCanvas();
    }

    initCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // 初始白色背景
        this.clearCanvas(false);
        this.saveState();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const width = container.clientWidth - 40;
        const height = container.clientHeight - 40;

        // 保存当前内容
        let imageData = null;
        if (this.canvas.width > 0 && this.canvas.height > 0) {
            try {
                imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            } catch (e) { /* 跨域等情况 */ }
        }

        this.canvas.width = Math.max(width, 400);
        this.canvas.height = Math.max(height, 300);
        this.tempCanvas.width = this.canvas.width;
        this.tempCanvas.height = this.canvas.height;

        // 恢复内容
        if (imageData) {
            try {
                this.ctx.putImageData(imageData, 0, 0);
            } catch (e) { /* 尺寸不匹配 */ }
        }

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // 更新画笔位置到画布中心
        if (this.penX === 0 && this.penY === 0) {
            this.penX = this.canvas.width / 2;
            this.penY = this.canvas.height / 2;
        }
    }

    // ================================================================
    // 区域坐标系统
    // ================================================================

    /**
     * 将区域名称转换为画布坐标
     * @param {string} region - 区域名称（如 'top-left', 'center'）
     * @returns {{x: number, y: number}} 坐标
     */
    regionToCoords(region) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const margin = 80; // 距边缘的距离

        const regionCoords = {
            'top-left':     { x: margin, y: margin },
            'top':          { x: w / 2, y: margin },
            'top-right':    { x: w - margin, y: margin },
            'left':         { x: margin, y: h / 2 },
            'center':       { x: w / 2, y: h / 2 },
            'right':        { x: w - margin, y: h / 2 },
            'bottom-left':  { x: margin, y: h - margin },
            'bottom':       { x: w / 2, y: h - margin },
            'bottom-right': { x: w - margin, y: h - margin },
            'center-left':  { x: w / 3, y: h / 2 },
            'center-right': { x: w * 2 / 3, y: h / 2 },
        };

        return regionCoords[region] || regionCoords['center'];
    }

    /**
     * 获取区域的中文名称
     */
    getRegionLabel(region) {
        const labels = {
            'top-left': '左上角', 'top': '上方', 'top-right': '右上角',
            'left': '左边', 'center': '中间', 'right': '右边',
            'bottom-left': '左下角', 'bottom': '下方', 'bottom-right': '右下角',
            'center-left': '中间偏左', 'center-right': '中间偏右',
        };
        return labels[region] || region;
    }

    // ================================================================
    // 绘图操作（语音命令驱动）
    // ================================================================

    /**
     * 在指定区域绘制图形
     * @param {string} shape - 图形类型
     * @param {string} region - 区域
     * @param {string} color - 颜色
     * @param {number} size - 大小
     * @param {number} [offsetX=0] - X轴偏移量
     * @param {number} [offsetY=0] - Y轴偏移量
     * @param {boolean} [fill=false] - 是否填充
     */
    drawShapeAtRegion(shape, region, color, size, offsetX, offsetY, fill) {
        const baseCoords = this.regionToCoords(region);
        const coords = {
            x: baseCoords.x + (offsetX || 0),
            y: baseCoords.y + (offsetY || 0),
        };
        const s = size || this.shapeSize;
        const c = color || this.currentColor;
        const shouldFill = !!fill;

        // 记录形状
        this.shapes.push({
            type: shape, color: c, size: s, region,
            cx: coords.x, cy: coords.y,
            offsetX: offsetX || 0, offsetY: offsetY || 0,
            lineWidth: this.brushSize,
            fill: shouldFill,
        });

        this.ctx.save();
        this.ctx.strokeStyle = c;
        this.ctx.fillStyle = c;
        this.ctx.lineWidth = this.brushSize;

        switch (shape) {
            case 'circle':
                this.drawCircle(coords.x, coords.y, s / 2, shouldFill);
                break;
            case 'ellipse':
                this.drawEllipse(coords.x, coords.y, s / 2, s / 3, shouldFill);
                break;
            case 'rect':
                this.drawRect(coords.x - s / 2, coords.y - s / 2, s, s, shouldFill);
                break;
            case 'triangle':
                this.drawTriangle(coords.x, coords.y, s, shouldFill);
                break;
            case 'star':
                this.drawStar(coords.x, coords.y, s / 2, s / 4, 5, shouldFill);
                break;
            case 'heart':
                this.drawHeart(coords.x, coords.y, s, shouldFill);
                break;
            case 'arrow':
                this.drawArrow(coords.x - s / 2, coords.y, coords.x + s / 2, coords.y);
                break;
            case 'hline':
                this.drawLine(coords.x - s, coords.y, coords.x + s, coords.y);
                break;
            case 'vline':
                this.drawLine(coords.x, coords.y - s, coords.x, coords.y + s);
                break;
            default:
                this.drawCircle(coords.x, coords.y, s / 2, shouldFill);
        }

        this.ctx.restore();
        this.saveState();
    }

    /**
     * 在两个区域之间画线
     */
    drawLineBetweenRegions(startRegion, endRegion, color, size) {
        const start = this.regionToCoords(startRegion);
        const end = this.regionToCoords(endRegion);
        const c = color || this.currentColor;
        const s = size || this.brushSize;

        this.shapes.push({
            type: 'line', color: c, size: s,
            startRegion, endRegion,
            x1: start.x, y1: start.y, x2: end.x, y2: end.y,
            lineWidth: s,
        });

        this.ctx.save();
        this.ctx.strokeStyle = c;
        this.ctx.lineWidth = s;
        this.drawLine(start.x, start.y, end.x, end.y);
        this.ctx.restore();
        this.saveState();
    }

    /**
     * 绘制场景（多个形状的组合）
     * @param {Array} shapes - 形状命令数组，每个元素包含 shape, region, color, size 等属性
     */
    drawScene(shapes) {
        for (const s of shapes) {
            this.drawShapeAtRegion(
                s.shape,
                s.region || 'center',
                s.color,
                s.size,
                s.offsetX || 0,
                s.offsetY || 0,
                s.fill || false
            );
        }
    }

    // 基础图形绘制方法
    drawCircle(cx, cy, r, fill) {
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (fill) this.ctx.fill();
        this.ctx.stroke();
    }

    drawEllipse(cx, cy, rx, ry, fill) {
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (fill) this.ctx.fill();
        this.ctx.stroke();
    }

    drawRect(x, y, w, h, fill) {
        this.ctx.beginPath();
        this.ctx.rect(x, y, w, h);
        if (fill) this.ctx.fill();
        this.ctx.stroke();
    }

    drawTriangle(cx, cy, size, fill) {
        const h = size * Math.sqrt(3) / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy - h * 2 / 3);
        this.ctx.lineTo(cx - size / 2, cy + h / 3);
        this.ctx.lineTo(cx + size / 2, cy + h / 3);
        this.ctx.closePath();
        if (fill) this.ctx.fill();
        this.ctx.stroke();
    }

    drawStar(cx, cy, outerR, innerR, points, fill) {
        this.ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const angle = (Math.PI * i) / points - Math.PI / 2;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.closePath();
        if (fill) this.ctx.fill();
        this.ctx.stroke();
    }

    drawHeart(cx, cy, size, fill) {
        const s = size / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy + s * 0.7);
        this.ctx.bezierCurveTo(cx - s, cy - s * 0.3, cx - s * 0.5, cy - s, cx, cy - s * 0.5);
        this.ctx.bezierCurveTo(cx + s * 0.5, cy - s, cx + s, cy - s * 0.3, cx, cy + s * 0.7);
        if (fill) this.ctx.fill();
        this.ctx.stroke();
    }

    drawArrow(x1, y1, x2, y2) {
        const headLen = 15;
        const angle = Math.atan2(y2 - y1, x2 - x1);

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();

        // 箭头头部
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(
            x2 - headLen * Math.cos(angle - Math.PI / 6),
            y2 - headLen * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(
            x2 - headLen * Math.cos(angle + Math.PI / 6),
            y2 - headLen * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.stroke();
    }

    drawLine(x1, y1, x2, y2) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }

    // ================================================================
    // 自由画笔模式
    // ================================================================

    startFreeDraw() {
        this.isFreeDrawing = true;
        this.penX = this.canvas.width / 2;
        this.penY = this.canvas.height / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(this.penX, this.penY);
    }

    stopFreeDraw() {
        this.isFreeDrawing = false;
        this.saveState();
    }

    /**
     * 在自由画笔模式下向指定方向移动并绘制
     * @param {{dx: number, dy: number}} direction - 方向
     * @param {number} distance - 移动距离
     */
    movePen(direction, distance) {
        if (!this.isFreeDrawing) return;

        const step = distance || this.penStep;
        const newX = this.penX + direction.dx * step;
        const newY = this.penY + direction.dy * step;

        // 限制在画布范围内
        const clampedX = Math.max(0, Math.min(this.canvas.width, newX));
        const clampedY = Math.max(0, Math.min(this.canvas.height, newY));

        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.beginPath();
        this.ctx.moveTo(this.penX, this.penY);
        this.ctx.lineTo(clampedX, clampedY);
        this.ctx.stroke();

        this.penX = clampedX;
        this.penY = clampedY;
    }

    // ================================================================
    // 文字绘制
    // ================================================================

    /**
     * 在指定区域绘制文字
     */
    drawTextAtRegion(text, region, fontSize, color) {
        const coords = this.regionToCoords(region);
        const size = fontSize || 28;
        const c = color || this.currentColor;

        this.shapes.push({
            type: 'text', content: text, color: c, fontSize: size, region,
            cx: coords.x, cy: coords.y,
        });

        this.ctx.save();
        this.ctx.font = `${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
        this.ctx.fillStyle = c;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, coords.x, coords.y);
        this.ctx.restore();
        this.saveState();
    }

    // ================================================================
    // 状态管理
    // ================================================================

    setTool(tool) {
        this.currentTool = tool;
    }

    setColor(color) {
        this.currentColor = color;
    }

    setBrushSize(size) {
        this.brushSize = Math.max(1, Math.min(50, size));
    }

    setShapeSize(size) {
        this.shapeSize = Math.max(10, Math.min(200, size));
    }

    adjustBrushSize(delta) {
        this.setBrushSize(this.brushSize + delta);
    }

    // ================================================================
    // 历史记录（撤销/重做）
    // ================================================================

    saveState() {
        // 清除重做历史
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        this.history.push(this.canvas.toDataURL());
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        this.historyIndex = this.history.length - 1;
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            if (this.shapes.length > 0) this.shapes.pop();
            this.restoreState();
            return true;
        }
        return false;
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState();
            return true;
        }
        return false;
    }

    restoreState() {
        if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
            const img = new Image();
            img.onload = () => {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, 0, 0);
            };
            img.src = this.history[this.historyIndex];
        }
    }

    // ================================================================
    // 画布操作
    // ================================================================

    clearCanvas(saveHistory = true) {
        this.shapes = [];
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (saveHistory) this.saveState();
    }

    saveImage() {
        const link = document.createElement('a');
        link.download = 'voice_drawing_' + new Date().toISOString().slice(0, 10) + '.png';
        link.href = this.canvas.toDataURL();
        link.click();
    }

    // ================================================================
    // 形状删除与重绘
    // ================================================================

    /**
     * 根据条件删除匹配的形状
     * @param {function} matchFn - 匹配函数，接收 shape 对象，返回 true 表示删除
     * @returns {number} 删除的数量
     */
    deleteShape(matchFn) {
        const before = this.shapes.length;
        // 删除最后一个匹配的形状（最新的）
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            if (matchFn(this.shapes[i])) {
                this.shapes.splice(i, 1);
                break;
            }
        }
        const deleted = before - this.shapes.length;
        if (deleted > 0) {
            this.redrawAll();
        }
        return deleted;
    }

    /**
     * 删除最近画的一个形状（不限条件）
     */
    deleteLastShape() {
        if (this.shapes.length === 0) return 0;
        this.shapes.pop();
        this.redrawAll();
        return 1;
    }

    /**
     * 重绘所有形状
     */
    redrawAll() {
        // 清空白画布
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // 逐个重绘
        for (const shape of this.shapes) {
            this.renderShape(shape);
        }

        this.saveState();
    }

    /**
     * 渲染单个形状对象
     */
    renderShape(shape) {
        this.ctx.save();
        this.ctx.strokeStyle = shape.color;
        this.ctx.fillStyle = shape.color;
        this.ctx.lineWidth = shape.lineWidth || this.brushSize;
        const fill = shape.fill || false;

        switch (shape.type) {
            case 'circle':
                this.drawCircle(shape.cx, shape.cy, shape.size / 2, fill);
                break;
            case 'ellipse':
                this.drawEllipse(shape.cx, shape.cy, shape.size / 2, shape.size / 3, fill);
                break;
            case 'rect':
                this.drawRect(shape.cx - shape.size / 2, shape.cy - shape.size / 2, shape.size, shape.size, fill);
                break;
            case 'triangle':
                this.drawTriangle(shape.cx, shape.cy, shape.size, fill);
                break;
            case 'star':
                this.drawStar(shape.cx, shape.cy, shape.size / 2, shape.size / 4, 5, fill);
                break;
            case 'heart':
                this.drawHeart(shape.cx, shape.cy, shape.size, fill);
                break;
            case 'arrow':
                this.drawArrow(shape.cx - shape.size / 2, shape.cy, shape.cx + shape.size / 2, shape.cy);
                break;
            case 'hline':
                this.drawLine(shape.cx - shape.size, shape.cy, shape.cx + shape.size, shape.cy);
                break;
            case 'vline':
                this.drawLine(shape.cx, shape.cy - shape.size, shape.cx, shape.cy + shape.size);
                break;
            case 'line':
                this.drawLine(shape.x1, shape.y1, shape.x2, shape.y2);
                break;
            case 'text':
                this.ctx.font = `${shape.fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(shape.content, shape.cx, shape.cy);
                break;
        }

        this.ctx.restore();
    }

    /**
     * 获取当前所有形状的描述列表（用于调试/提示）
     */
    getShapesDescription() {
        return this.shapes.map((s, i) => {
            const regionLabel = this.getRegionLabel(s.region || s.startRegion || 'center');
            if (s.type === 'text') return `${i + 1}. 文字"${s.content}" 在${regionLabel}`;
            if (s.type === 'line' && s.startRegion) {
                return `${i + 1}. 线条 从${this.getRegionLabel(s.startRegion)}到${this.getRegionLabel(s.endRegion)}`;
            }
            return `${i + 1}. ${s.color} ${s.type} 在${regionLabel}`;
        });
    }

    // ================================================================
    // 辅助方法
    // ================================================================

    /**
     * 绘制9宫格辅助线（调试/教学用）
     */
    drawGrid() {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);

        const w = this.canvas.width;
        const h = this.canvas.height;

        // 竖线
        this.drawLine(w / 3, 0, w / 3, h);
        this.drawLine(w * 2 / 3, 0, w * 2 / 3, h);
        // 横线
        this.drawLine(0, h / 3, w, h / 3);
        this.drawLine(0, h * 2 / 3, w, h * 2 / 3);

        this.ctx.setLineDash([]);
        this.ctx.restore();
    }

    /**
     * 移除辅助线（重绘最后保存的状态）
     */
    removeGrid() {
        this.restoreState();
    }
}

// 导出
window.CanvasDrawingModule = CanvasDrawingModule;
