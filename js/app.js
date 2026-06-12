/**
 * 纯语音控制绘图工具 - 主应用
 *
 * 核心流程：语音识别 → 命令解析 → 执行绘图 → 语音反馈
 * 设计原则：零鼠标/键盘依赖，所有操作通过语音完成
 */

class App {
    constructor() {
        // 初始化模块
        this.canvas = new CanvasDrawingModule('drawing-canvas');
        this.speech = new SpeechRecognitionModule();
        this.tts = new SpeechSynthesisModule();
        this.parser = new VoiceCommandParser();
        this.history = new CommandHistory();

        // 应用状态
        this.isListening = false;
        this.showHelp = false;
        this.showGrid = false;
        this.feedbackTimer = null;
        this.pendingRepeat = null; // 上一条未确认的命令（用于重复执行）

        // DOM 元素
        this.el = {
            // 状态栏
            statusTool: document.getElementById('status-tool'),
            statusColorDot: document.getElementById('status-color-dot'),
            statusColor: document.getElementById('status-color'),
            statusSize: document.getElementById('status-size'),
            helpToggle: document.getElementById('btn-help-toggle'),

            // 画布
            penIndicator: document.getElementById('pen-indicator'),

            // 帮助面板
            helpPanel: document.getElementById('help-panel'),
            helpClose: document.getElementById('btn-help-close'),

            // 语音
            btnVoice: document.getElementById('btn-voice'),
            voiceStatus: document.getElementById('voice-status'),
            voiceWave: document.getElementById('voice-wave'),
            voiceTranscript: document.getElementById('voice-transcript'),
            voiceFeedback: document.getElementById('voice-feedback'),
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.setupSpeechCallbacks();
        this.updateStatusBar();
        this.showWelcome();
    }

    // ============================================================
    // 欢迎引导
    // ============================================================

    showWelcome() {
        // 创建欢迎遮罩
        const overlay = document.createElement('div');
        overlay.className = 'welcome-overlay';
        overlay.innerHTML = `
            <div class="welcome-content">
                <h2>🎨 纯语音绘图工具</h2>
                <p>
                    完全通过语音控制来创作绘图<br>
                    说出指令，我来帮你画！<br><br>
                    <strong>示例指令：</strong><br>
                    "画一个红色圆形在中间"<br>
                    "画一条蓝色直线从左上到右下"<br>
                    "撤销" / "清除" / "保存"
                </p>
                <button class="welcome-btn" id="btn-start">🎤 开始使用</button>
            </div>
        `;
        document.body.appendChild(overlay);

        // 点击开始
        document.getElementById('btn-start').addEventListener('click', () => {
            overlay.classList.add('hidden');
            setTimeout(() => overlay.remove(), 500);
            this.startListening();
            this.tts.speak('语音绘图工具已就绪，请说出你的绘图指令。');
        });
    }

    // ============================================================
    // 事件绑定
    // ============================================================

    bindEvents() {
        // 语音按钮
        this.el.btnVoice.addEventListener('click', () => this.toggleListening());

        // 帮助面板
        this.el.helpToggle.addEventListener('click', () => this.toggleHelp());
        this.el.helpClose.addEventListener('click', () => this.toggleHelp());
    }

    // ============================================================
    // 语音回调设置
    // ============================================================

    setupSpeechCallbacks() {
        this.speech.onStart = () => {
            this.isListening = true;
            this.el.btnVoice.classList.add('listening');
            this.el.btnVoice.querySelector('.voice-label').textContent = '正在聆听...';
            this.el.voiceStatus.textContent = '正在聆听';
            this.el.voiceWave.classList.remove('hidden');
        };

        this.speech.onInterim = (text) => {
            this.el.voiceTranscript.textContent = '🎤 ' + text;
        };

        this.speech.onResult = (text) => {
            this.el.voiceTranscript.textContent = '✅ ' + text;
            this.processVoiceInput(text);
        };

        this.speech.onEnd = () => {
            this.isListening = false;
            this.el.btnVoice.classList.remove('listening');
            this.el.btnVoice.querySelector('.voice-label').textContent = '点击开启语音';
            this.el.voiceStatus.textContent = '已暂停';
            this.el.voiceWave.classList.add('hidden');
        };

        this.speech.onError = (error) => {
            this.el.voiceStatus.textContent = '错误: ' + error;
            this.showFeedback('语音识别出错: ' + error, 'error');

            if (error === 'not-allowed') {
                this.tts.speak('请允许麦克风权限后重试。', true);
            }
        };
    }

    // ============================================================
    // 语音控制
    // ============================================================

    toggleListening() {
        if (this.speech.shouldBeListening) {
            this.stopListening();
        } else {
            this.startListening();
        }
    }

    startListening() {
        const ok = this.speech.start();
        if (ok) {
            this.el.voiceStatus.textContent = '正在启动...';
        } else {
            this.showFeedback('无法启动语音识别', 'error');
        }
    }

    stopListening() {
        this.speech.stop();
        this.el.voiceStatus.textContent = '已停止';
    }

    // ============================================================
    // 命令处理核心
    // ============================================================

    processVoiceInput(text) {
        if (!text || text.trim().length === 0) return;

        // 解析命令
        const commands = this.parser.parse(text);

        if (commands.length === 0) {
            this.showFeedback('未识别到有效指令', 'error');
            this.tts.speak('没有听清，请再说一次。');
            return;
        }

        // 执行每个命令
        for (const cmd of commands) {
            this.executeCommand(cmd);
            this.history.push(cmd);
        }
    }

    executeCommand(cmd) {
        if (!cmd) return;

        switch (cmd.action) {
            case 'draw':
                this.cmdDraw(cmd);
                break;
            case 'text':
                this.cmdText(cmd);
                break;
            case 'start_draw':
                this.cmdStartDraw();
                break;
            case 'stop_draw':
                this.cmdStopDraw();
                break;
            case 'move':
                this.cmdMove(cmd);
                break;
            case 'color':
                this.cmdColor(cmd);
                break;
            case 'size':
                this.cmdSize(cmd);
                break;
            case 'undo':
                this.cmdUndo();
                break;
            case 'redo':
                this.cmdRedo();
                break;
            case 'clear':
                this.cmdClear();
                break;
            case 'save':
                this.cmdSave();
                break;
            case 'help':
                this.cmdHelp();
                break;
            case 'unknown':
                this.showFeedback(`未理解: "${cmd.raw}"`, 'error');
                this.tts.speak('没有理解这个指令，请参考帮助。');
                break;
        }
    }

    // ============================================================
    // 命令执行方法
    // ============================================================

    /**
     * 绘制图形
     */
    cmdDraw(cmd) {
        const color = cmd.color || this.canvas.currentColor;
        const size = cmd.size || this.canvas.shapeSize;

        // 更新当前状态
        if (cmd.color) this.canvas.setColor(cmd.color);
        if (cmd.size) this.canvas.setShapeSize(cmd.size);

        // 线条特殊处理（有起点和终点）
        if (cmd.shape === 'line' && cmd.startRegion && cmd.endRegion) {
            this.canvas.drawLineBetweenRegions(cmd.startRegion, cmd.endRegion, color, cmd.size);
            const desc = this.parser.describeCommand(cmd);
            this.showFeedback(desc, 'success');
            this.tts.speak(`好的，已在${this.canvas.getRegionLabel(cmd.startRegion)}到${this.canvas.getRegionLabel(cmd.endRegion)}之间画了一条线。`);
            return;
        }

        // 横线/竖线
        if (cmd.shape === 'hline' || cmd.shape === 'vline') {
            this.canvas.drawShapeAtRegion(cmd.shape, cmd.region, color, size);
            const label = cmd.shape === 'hline' ? '横线' : '竖线';
            this.showFeedback(`在${this.canvas.getRegionLabel(cmd.region)}画了${label}`, 'success');
            this.tts.speak(`好的，已在${this.canvas.getRegionLabel(cmd.region)}画了一条${label}。`);
            return;
        }

        // 普通形状
        this.canvas.drawShapeAtRegion(cmd.shape, cmd.region, color, size);

        // 构建反馈
        const colorName = this.getColorName(color);
        const shapeName = this.getShapeName(cmd.shape);
        const regionName = this.canvas.getRegionLabel(cmd.region);

        const feedback = `${colorName}${shapeName} → ${regionName}`;
        this.showFeedback(feedback, 'success');
        this.tts.speak(`好的，已在${regionName}画了一个${colorName}${shapeName}。`);

        this.pendingRepeat = cmd;
    }

    /**
     * 文字标注
     */
    cmdText(cmd) {
        const color = this.canvas.currentColor;
        this.canvas.drawTextAtRegion(cmd.content, cmd.region, 28, color);

        const regionName = this.canvas.getRegionLabel(cmd.region);
        this.showFeedback(`文字"${cmd.content}" → ${regionName}`, 'success');
        this.tts.speak(`好的，已在${regionName}写上了${cmd.content}。`);
    }

    /**
     * 开始自由画笔
     */
    cmdStartDraw() {
        this.canvas.startFreeDraw();
        this.el.penIndicator.classList.remove('hidden');
        this.showFeedback('自由画笔已开启', 'info');
        this.tts.speak('自由画笔已开启。请用方向指令控制画笔移动，比如说往上、往左。');
    }

    /**
     * 停止自由画笔
     */
    cmdStopDraw() {
        this.canvas.stopFreeDraw();
        this.el.penIndicator.classList.add('hidden');
        this.showFeedback('自由画笔已停止', 'info');
        this.tts.speak('已停止自由绘画。');
    }

    /**
     * 方向移动（自由画模式）
     */
    cmdMove(cmd) {
        if (!this.canvas.isFreeDrawing) {
            this.showFeedback('请先说"开始画"开启画笔', 'error');
            this.tts.speak('请先说开始画，开启自由画笔模式。');
            return;
        }

        this.canvas.movePen(cmd.direction);
        this.showFeedback(`画笔向${cmd.label}移动`, 'info');
    }

    /**
     * 切换颜色
     */
    cmdColor(cmd) {
        this.canvas.setColor(cmd.color);
        this.updateStatusBar();

        const colorName = cmd.label || this.getColorName(cmd.color);
        this.showFeedback(`颜色: ${colorName}`, 'success');
        this.tts.speak(`好的，已切换为${colorName}。`);
    }

    /**
     * 调整大小
     */
    cmdSize(cmd) {
        let newSize;
        let desc;

        if (cmd.value === 'bigger') {
            newSize = Math.min(100, this.canvas.shapeSize + 20);
            desc = '变大';
        } else if (cmd.value === 'smaller') {
            newSize = Math.max(10, this.canvas.shapeSize - 20);
            desc = '变小';
        } else {
            newSize = cmd.value;
            desc = `设为${newSize}`;
        }

        this.canvas.setShapeSize(newSize);
        this.canvas.setBrushSize(Math.max(1, Math.round(newSize / 10)));
        this.updateStatusBar();

        this.showFeedback(`大小: ${desc}`, 'success');
        this.tts.speak(`好的，大小已${desc}。`);
    }

    /**
     * 撤销
     */
    cmdUndo() {
        if (this.canvas.undo()) {
            this.showFeedback('已撤销', 'success');
            this.tts.speak('已撤销。');
        } else {
            this.showFeedback('没有可以撤销的操作', 'error');
            this.tts.speak('没有可以撤销的操作了。');
        }
    }

    /**
     * 重做
     */
    cmdRedo() {
        if (this.canvas.redo()) {
            this.showFeedback('已重做', 'success');
            this.tts.speak('已重做。');
        } else {
            this.showFeedback('没有可以重做的操作', 'error');
            this.tts.speak('没有可以重做的操作了。');
        }
    }

    /**
     * 清除画布
     */
    cmdClear() {
        this.canvas.clearCanvas(true);
        this.showFeedback('画布已清除', 'success');
        this.tts.speak('画布已清除。');
    }

    /**
     * 保存图片
     */
    cmdSave() {
        this.canvas.saveImage();
        this.showFeedback('图片已保存', 'success');
        this.tts.speak('图片已保存到下载文件夹。');
    }

    /**
     * 显示帮助
     */
    cmdHelp() {
        if (!this.showHelp) this.toggleHelp();
        this.tts.speak('已打开帮助面板。你可以画圆形、矩形、三角形、线条等图形，也可以切换颜色和大小，或者使用自由画笔模式。');
    }

    // ============================================================
    // UI 更新
    // ============================================================

    updateStatusBar() {
        // 工具
        const toolNames = {
            'pen': '画笔', 'line': '直线', 'rect': '矩形',
            'circle': '圆形', 'eraser': '橡皮擦',
        };
        this.el.statusTool.textContent = toolNames[this.canvas.currentTool] || '画笔';

        // 颜色
        const colorName = this.getColorName(this.canvas.currentColor);
        this.el.statusColor.textContent = colorName;
        this.el.statusColorDot.style.background = this.canvas.currentColor;

        // 大小
        this.el.statusSize.textContent = this.canvas.shapeSize;
    }

    toggleHelp() {
        this.showHelp = !this.showHelp;
        this.el.helpPanel.classList.toggle('hidden', !this.showHelp);
    }

    /**
     * 显示命令反馈
     */
    showFeedback(text, type = 'info') {
        const item = document.createElement('div');
        item.className = `feedback-item ${type}`;
        item.textContent = text;

        this.el.voiceFeedback.appendChild(item);

        // 最多保留3个反馈
        while (this.el.voiceFeedback.children.length > 3) {
            this.el.voiceFeedback.removeChild(this.el.voiceFeedback.firstChild);
        }

        // 5秒后移除
        setTimeout(() => {
            if (item.parentNode) {
                item.style.opacity = '0';
                item.style.transition = 'opacity 0.3s';
                setTimeout(() => item.remove(), 300);
            }
        }, 5000);
    }

    // ============================================================
    // 辅助方法
    // ============================================================

    getColorName(hex) {
        const nameMap = {
            '#FF0000': '红色', '#8B0000': '深红色', '#00AA00': '绿色',
            '#7CFC00': '草绿色', '#006400': '深绿色', '#90EE90': '浅绿色',
            '#0000FF': '蓝色', '#87CEEB': '天蓝色', '#00008B': '深蓝色', '#ADD8E6': '浅蓝色',
            '#FFD700': '黄色', '#000000': '黑色', '#FFFFFF': '白色',
            '#800080': '紫色', '#DA70D6': '粉紫色',
            '#FF69B4': '粉色', '#FFA500': '橙色', '#808080': '灰色',
            '#C0C0C0': '浅灰色', '#404040': '深灰色',
            '#8B4513': '棕色', '#00FFFF': '青色',
        };
        return nameMap[hex.toUpperCase()] || hex;
    }

    getShapeName(shape) {
        const nameMap = {
            'circle': '圆形', 'ellipse': '椭圆', 'rect': '矩形',
            'triangle': '三角形', 'star': '五角星', 'heart': '爱心',
            'arrow': '箭头', 'line': '线条', 'hline': '横线', 'vline': '竖线',
        };
        return nameMap[shape] || shape;
    }
}

// ============================================================
// 启动
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
