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
        this.penType = 'pen'; // 画笔类型：brush/pen/pencil/watercolor/crayon/marker/chalk/oil

        // 形状追踪（用于删除功能）
        this.shapes = [];

        // 视口状态（缩放与平移）
        this.viewport = { scale: 1.0, offsetX: 0, offsetY: 0 };

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
            penType: this.penType,
        });

        this.ctx.save();
        this.applyPenStyle(this.ctx, c, this.brushSize);
        this.ctx.fillStyle = c;

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

    /**
     * 绘制多色交替图案
     * @param {string} shape - 形状类型（目前支持 circle）
     * @param {string} region - 区域
     * @param {string[]} colors - 颜色数组
     * @param {number} size - 大小
     * @param {number} segments - 总弧段数
     */
    drawPattern(shape, region, colors, size, segments) {
        const coords = this.regionToCoords(region);
        const s = size || this.shapeSize;
        const r = s / 2;
        const segCount = segments || colors.length * 2;

        if (shape === 'circle' || shape === 'ellipse') {
            // 绘制交替颜色的弧段
            const angleStep = (Math.PI * 2) / segCount;

            for (let i = 0; i < segCount; i++) {
                const startAngle = i * angleStep - Math.PI / 2;
                const endAngle = startAngle + angleStep;
                const color = colors[i % colors.length];

                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.moveTo(coords.x, coords.y);
                this.ctx.arc(coords.x, coords.y, r, startAngle, endAngle);
                this.ctx.closePath();
                this.ctx.fillStyle = color;
                this.ctx.fill();
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = this.brushSize;
                this.ctx.stroke();
                this.ctx.restore();
            }
        } else {
            // 非圆形：按行列分块填充
            const cols = Math.ceil(Math.sqrt(segCount));
            const rows = Math.ceil(segCount / cols);
            const cellW = s / cols;
            const cellH = s / rows;
            const startX = coords.x - s / 2;
            const startY = coords.y - s / 2;

            for (let i = 0; i < segCount; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                if (row >= rows) break;

                this.ctx.save();
                this.ctx.fillStyle = colors[i % colors.length];
                this.ctx.fillRect(startX + col * cellW, startY + row * cellH, cellW, cellH);
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(startX + col * cellW, startY + row * cellH, cellW, cellH);
                this.ctx.restore();
            }
        }

        // 记录形状
        this.shapes.push({
            type: 'pattern', shape, color: colors[0], size: s, region,
            cx: coords.x, cy: coords.y,
            colors, segments: segCount,
            lineWidth: this.brushSize,
        });

        this.saveState();
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
     * 根据画笔类型设置 ctx 绘图属性
     * @param {CanvasRenderingContext2D} ctx - 绘图上下文
     * @param {string} [color] - 颜色覆盖
     * @param {number} [lineWidth] - 线宽覆盖
     */
    applyPenStyle(ctx, color, lineWidth) {
        const c = color || this.currentColor;
        const w = lineWidth || this.brushSize;

        switch (this.penType) {
            case 'brush': // 毛笔：较宽，透明度稍低
                ctx.strokeStyle = c;
                ctx.lineWidth = w * 1.5;
                ctx.globalAlpha = 0.85;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                break;
            case 'pen': // 钢笔：均匀线条，默认
                ctx.strokeStyle = c;
                ctx.lineWidth = w;
                ctx.globalAlpha = 1.0;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                break;
            case 'pencil': // 铅笔：较细，灰色调
                ctx.strokeStyle = '#555555';
                ctx.lineWidth = Math.max(1, w * 0.6);
                ctx.globalAlpha = 0.7;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                break;
            case 'watercolor': // 水彩笔：半透明，较宽
                ctx.strokeStyle = c;
                ctx.lineWidth = w * 2;
                ctx.globalAlpha = 0.4;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                break;
            case 'crayon': // 蜡笔：不规则边缘（多次叠加细线模拟）
                ctx.strokeStyle = c;
                ctx.lineWidth = w;
                ctx.globalAlpha = 0.8;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                break;
            case 'marker': // 马克笔：宽线条，半透明
                ctx.strokeStyle = c;
                ctx.lineWidth = w * 2.5;
                ctx.globalAlpha = 0.5;
                ctx.lineCap = 'butt';
                ctx.lineJoin = 'miter';
                break;
            case 'chalk': // 粉笔：较宽，半透明
                ctx.strokeStyle = c;
                ctx.lineWidth = w * 1.8;
                ctx.globalAlpha = 0.6;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                break;
            case 'oil': // 油画笔：宽线条，不透明
                ctx.strokeStyle = c;
                ctx.lineWidth = w * 2;
                ctx.globalAlpha = 1.0;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                break;
            default:
                ctx.strokeStyle = c;
                ctx.lineWidth = w;
                ctx.globalAlpha = 1.0;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
        }
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

        this.ctx.save();
        this.applyPenStyle(this.ctx);

        if (this.penType === 'crayon') {
            // 蜡笔效果：多次叠加细线模拟不规则边缘
            for (let i = 0; i < 3; i++) {
                const offsetX = (Math.random() - 0.5) * this.brushSize * 0.4;
                const offsetY = (Math.random() - 0.5) * this.brushSize * 0.4;
                this.ctx.beginPath();
                this.ctx.moveTo(this.penX + offsetX, this.penY + offsetY);
                this.ctx.lineTo(clampedX + offsetX, clampedY + offsetY);
                this.ctx.stroke();
            }
        } else {
            this.ctx.beginPath();
            this.ctx.moveTo(this.penX, this.penY);
            this.ctx.lineTo(clampedX, clampedY);
            this.ctx.stroke();
        }

        this.ctx.restore();

        this.penX = clampedX;
        this.penY = clampedY;
    }

    /**
     * 连续方向移动：依次执行多个方向的画笔移动
     * @param {Array<{dx: number, dy: number}>} directions - 方向数组
     * @param {number} [steps=1] - 每个方向的重复次数
     */
    movePenSequence(directions, steps) {
        if (!this.isFreeDrawing || !directions || directions.length === 0) return;

        const repeatCount = steps || 1;
        for (let r = 0; r < repeatCount; r++) {
            for (const dir of directions) {
                this.movePen(dir);
            }
        }
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

    setPenType(type) {
        this.penType = type;
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
        this.viewport = { scale: 1.0, offsetX: 0, offsetY: 0 };
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (saveHistory) this.saveState();
    }

    // ================================================================
    // 视口控制（缩放与平移）
    // ================================================================

    /**
     * 放大画布
     */
    zoomIn() {
        this.viewport.scale = Math.min(3.0, this.viewport.scale + 0.25);
        this.applyViewport();
    }

    /**
     * 缩小画布
     */
    zoomOut() {
        this.viewport.scale = Math.max(0.5, this.viewport.scale - 0.25);
        this.applyViewport();
    }

    /**
     * 将视口平移到指定区域，使该区域居中显示
     * @param {string} region - 区域名称
     */
    panToRegion(region) {
        const coords = this.regionToCoords(region);
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        // 计算偏移量：将目标区域中心移到画布中心
        this.viewport.offsetX = centerX - coords.x * this.viewport.scale;
        this.viewport.offsetY = centerY - coords.y * this.viewport.scale;

        this.applyViewport();
    }

    /**
     * 重置视口到默认状态
     */
    resetViewport() {
        this.viewport = { scale: 1.0, offsetX: 0, offsetY: 0 };
        this.applyViewport();
    }

    /**
     * 应用视口变换并重绘
     */
    applyViewport() {
        this.redrawAll();
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
     * 重绘所有形状（应用视口变换）
     */
    redrawAll() {
        this.ctx.save();

        // 清空白画布
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 应用视口变换
        this.ctx.translate(this.viewport.offsetX, this.viewport.offsetY);
        this.ctx.scale(this.viewport.scale, this.viewport.scale);

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // 逐个重绘
        for (const shape of this.shapes) {
            this.renderShape(shape);
        }

        this.ctx.restore();
        this.saveState();
    }

    /**
     * 渲染单个形状对象
     */
    renderShape(shape) {
        this.ctx.save();
        // 使用形状记录的画笔类型（如有），否则用当前画笔类型
        const savedPenType = this.penType;
        if (shape.penType) this.penType = shape.penType;
        this.applyPenStyle(this.ctx, shape.color, shape.lineWidth || this.brushSize);
        this.penType = savedPenType;
        this.ctx.fillStyle = shape.color;
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
            case 'pattern':
                this.ctx.restore(); // 恢复后再单独处理图案
                this.drawPattern(shape.shape, shape.region, shape.colors, shape.size, shape.segments);
                return; // drawPattern 已经处理了 save/restore
        }

        this.ctx.restore();
    }

    /**
     * 形状智能排列
     * @param {string} mode - 排列模式: grid/center/align_left/align_right/align_top/align_bottom/distribute_h/distribute_v
     */
    arrangeShapes(mode) {
        if (this.shapes.length === 0) return;

        const w = this.canvas.width;
        const h = this.canvas.height;

        // 获取形状的中心点坐标
        const getCenter = (s) => {
            if (s.type === 'line') {
                return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
            }
            return { x: s.cx, y: s.cy };
        };

        // 移动形状到新中心点
        const moveTo = (s, newCx, newCy) => {
            if (s.type === 'line') {
                const oldCx = (s.x1 + s.x2) / 2;
                const oldCy = (s.y1 + s.y2) / 2;
                const dx = newCx - oldCx;
                const dy = newCy - oldCy;
                s.x1 += dx; s.y1 += dy;
                s.x2 += dx; s.y2 += dy;
            } else {
                s.cx = newCx;
                s.cy = newCy;
            }
        };

        switch (mode) {
            case 'grid': {
                const count = this.shapes.length;
                const cols = Math.ceil(Math.sqrt(count));
                const rows = Math.ceil(count / cols);
                const cellW = w / (cols + 1);
                const cellH = h / (rows + 1);
                for (let i = 0; i < count; i++) {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    moveTo(this.shapes[i], cellW * (col + 1), cellH * (row + 1));
                }
                break;
            }
            case 'center': {
                // 计算所有形状的包围盒中心
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const s of this.shapes) {
                    const c = getCenter(s);
                    minX = Math.min(minX, c.x);
                    minY = Math.min(minY, c.y);
                    maxX = Math.max(maxX, c.x);
                    maxY = Math.max(maxY, c.y);
                }
                const bboxCx = (minX + maxX) / 2;
                const bboxCy = (minY + maxY) / 2;
                const dx = w / 2 - bboxCx;
                const dy = h / 2 - bboxCy;
                for (const s of this.shapes) {
                    const c = getCenter(s);
                    moveTo(s, c.x + dx, c.y + dy);
                }
                break;
            }
            case 'align_left': {
                let minX = Infinity;
                for (const s of this.shapes) {
                    const c = getCenter(s);
                    if (c.x < minX) minX = c.x;
                }
                for (const s of this.shapes) {
                    const c = getCenter(s);
                    moveTo(s, minX, c.y);
                }
                break;
            }
            case 'align_right': {
                let maxX = -Infinity;
                for (const s of this.shapes) {
                    const c = getCenter(s);
                    if (c.x > maxX) maxX = c.x;
                }
                for (const s of this.shapes) {
                    const c = getCenter(s);
                    moveTo(s, maxX, c.y);
                }
                break;
            }
            case 'align_top': {
                let minY = Infinity;
                for (const s of this.shapes) {
                    const c = getCenter(s);
                    if (c.y < minY) minY = c.y;
                }
                for (const s of this.shapes) {
                    const c = getCenter(s);
                    moveTo(s, c.x, minY);
                }
                break;
            }
            case 'align_bottom': {
                let maxY = -Infinity;
                for (const s of this.shapes) {
                    const c = getCenter(s);
                    if (c.y > maxY) maxY = c.y;
                }
                for (const s of this.shapes) {
                    const c = getCenter(s);
                    moveTo(s, c.x, maxY);
                }
                break;
            }
            case 'distribute_h': {
                if (this.shapes.length < 3) break;
                const sorted = [...this.shapes].sort((a, b) => getCenter(a).x - getCenter(b).x);
                const firstX = getCenter(sorted[0]).x;
                const lastX = getCenter(sorted[sorted.length - 1]).x;
                const gap = (lastX - firstX) / (sorted.length - 1);
                for (let i = 1; i < sorted.length - 1; i++) {
                    const c = getCenter(sorted[i]);
                    moveTo(sorted[i], firstX + gap * i, c.y);
                }
                break;
            }
            case 'distribute_v': {
                if (this.shapes.length < 3) break;
                const sorted = [...this.shapes].sort((a, b) => getCenter(a).y - getCenter(b).y);
                const firstY = getCenter(sorted[0]).y;
                const lastY = getCenter(sorted[sorted.length - 1]).y;
                const gap = (lastY - firstY) / (sorted.length - 1);
                for (let i = 1; i < sorted.length - 1; i++) {
                    const c = getCenter(sorted[i]);
                    moveTo(sorted[i], c.x, firstY + gap * i);
                }
                break;
            }
        }

        this.redrawAll();
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
