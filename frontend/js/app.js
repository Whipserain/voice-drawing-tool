/**
 * 纯语音控制绘图工具 - 主应用（优化版）
 *
 * 核心优化：
 * 1. TTS 播报期间自动暂停语音识别，防止回声干扰
 * 2. TTS 结束后自动恢复识别，无缝衔接下一条指令
 * 3. 智能反馈：短命令用短回复，减少 TTS 占用时间
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

        // DOM 元素
        this.el = {
            statusTool: document.getElementById('status-tool'),
            statusColorDot: document.getElementById('status-color-dot'),
            statusColor: document.getElementById('status-color'),
            statusSize: document.getElementById('status-size'),
            helpToggle: document.getElementById('btn-help-toggle'),
            penIndicator: document.getElementById('pen-indicator'),
            helpPanel: document.getElementById('help-panel'),
            helpClose: document.getElementById('btn-help-close'),
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
        this.setupTTSCallbacks();
        this.updateStatusBar();
        this.showWelcome();
    }

    // ============================================================
    // 欢迎引导
    // ============================================================

    showWelcome() {
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
                    "帮我画个大一点的蓝色矩形放右上角"<br>
                    "从左上到右下画一条线"<br>
                    "撤销" / "清除" / "保存"
                </p>
                <button class="welcome-btn" id="btn-start">🎤 开始使用</button>
            </div>
        `;
        document.body.appendChild(overlay);

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
        this.el.btnVoice.addEventListener('click', () => this.toggleListening());
        this.el.helpToggle.addEventListener('click', () => this.toggleHelp());
        this.el.helpClose.addEventListener('click', () => this.toggleHelp());
    }

    // ============================================================
    // TTS 回调：播报期间暂停/恢复语音识别
    // ============================================================

    setupTTSCallbacks() {
        this.tts.onSpeakStart = () => {
            // TTS 开始播报 → 暂停语音识别，防止回声
            this.speech.pause();
            this.el.voiceStatus.textContent = '🔊 播报中（暂停聆听）';
            this.el.voiceWave.classList.add('hidden');
        };

        this.tts.onSpeakEnd = () => {
            // TTS 播报结束 → 恢复语音识别
            this.speech.resume();
            if (this.speech.shouldBeListening) {
                this.el.voiceStatus.textContent = '正在聆听';
                this.el.voiceWave.classList.remove('hidden');
            }
        };
    }

    // ============================================================
    // 语音回调
    // ============================================================

    setupSpeechCallbacks() {
        this.speech.onStart = () => {
            this.isListening = true;
            this.el.btnVoice.classList.add('listening');
            this.el.btnVoice.querySelector('.voice-label').textContent = '正在聆听...';
            if (!this.tts.speaking) {
                this.el.voiceStatus.textContent = '正在聆听';
                this.el.voiceWave.classList.remove('hidden');
            }
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
            if (!this.speech.isPaused) {
                this.el.btnVoice.classList.remove('listening');
                this.el.btnVoice.querySelector('.voice-label').textContent = '点击开启语音';
                this.el.voiceStatus.textContent = '已暂停';
                this.el.voiceWave.classList.add('hidden');
            }
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
        this.tts.cancel();
        this.el.voiceStatus.textContent = '已停止';
    }

    // ============================================================
    // 命令处理核心
    // ============================================================

    processVoiceInput(text) {
        if (!text || text.trim().length === 0) return;

        const commands = this.parser.parse(text);

        if (commands.length === 0) {
            this.showFeedback('未识别到有效指令', 'error');
            this.tts.speak('没有听清，请再说一次。');
            return;
        }

        for (const cmd of commands) {
            this.executeCommand(cmd);
            this.history.push(cmd);
        }
    }

    executeCommand(cmd) {
        if (!cmd) return;

        switch (cmd.action) {
            case 'draw':    this.cmdDraw(cmd); break;
            case 'scene':   this.cmdScene(cmd); break;
            case 'text':    this.cmdText(cmd); break;
            case 'delete':  this.cmdDelete(cmd); break;
            case 'start_draw': this.cmdStartDraw(); break;
            case 'stop_draw':  this.cmdStopDraw(); break;
            case 'move':    this.cmdMove(cmd); break;
            case 'color':   this.cmdColor(cmd); break;
            case 'size':    this.cmdSize(cmd); break;
            case 'undo':    this.cmdUndo(); break;
            case 'redo':    this.cmdRedo(); break;
            case 'clear':   this.cmdClear(); break;
            case 'save':    this.cmdSave(); break;
            case 'help':    this.cmdHelp(); break;
            case 'read_canvas': this.cmdReadCanvas(); break;
            case 'unknown':
                this.showFeedback(`未理解: "${cmd.raw}"`, 'error');
                this.tts.speak('没听懂，请参考帮助。');
                break;
        }
    }

    // ============================================================
    // 命令执行方法（优化：精简 TTS 反馈，减少占用时间）
    // ============================================================

    cmdDraw(cmd) {
        const color = cmd.color || this.canvas.currentColor;
        const size = cmd.size || this.canvas.shapeSize;

        if (cmd.color) this.canvas.setColor(cmd.color);
        if (cmd.size) this.canvas.setShapeSize(cmd.size);

        // 线条：起点到终点
        if (cmd.shape === 'line' && cmd.startRegion && cmd.endRegion) {
            this.canvas.drawLineBetweenRegions(cmd.startRegion, cmd.endRegion, color, size);
            const r1 = this.canvas.getRegionLabel(cmd.startRegion);
            const r2 = this.canvas.getRegionLabel(cmd.endRegion);
            this.showFeedback(`${r1} → ${r2} 线条`, 'success');
            this.tts.speak(`好的，${r1}到${r2}画好了。`);
            return;
        }

        // 横线/竖线
        if (cmd.shape === 'hline' || cmd.shape === 'vline') {
            this.canvas.drawShapeAtRegion(cmd.shape, cmd.region, color, size);
            const label = cmd.shape === 'hline' ? '横线' : '竖线';
            this.showFeedback(`${label} → ${this.canvas.getRegionLabel(cmd.region)}`, 'success');
            this.tts.speak(`${label}画好了。`);
            return;
        }

        // 普通形状
        this.canvas.drawShapeAtRegion(cmd.shape, cmd.region, color, size);

        const colorName = this.getColorName(color);
        const shapeName = this.getShapeName(cmd.shape);
        const regionName = this.canvas.getRegionLabel(cmd.region);

        this.showFeedback(`${colorName}${shapeName} → ${regionName}`, 'success');
        this.tts.speak(`好的，${regionName}的${colorName}${shapeName}画好了。`);
    }

    cmdScene(cmd) {
        this.canvas.drawScene(cmd.shapes);
        const sceneName = cmd.label || cmd.template;
        this.showFeedback(`已绘制场景: ${sceneName}`, 'success');
        this.tts.speak(`已为你画出${sceneName}。`);
    }

    cmdText(cmd) {
        const color = this.canvas.currentColor;
        this.canvas.drawTextAtRegion(cmd.content, cmd.region, 28, color);

        const regionName = this.canvas.getRegionLabel(cmd.region);
        this.showFeedback(`"${cmd.content}" → ${regionName}`, 'success');
        this.tts.speak(`写好了。`);
    }

    /**
     * 删除形状
     */
    cmdDelete(cmd) {
        let deleted = 0;

        if (cmd.matchType === 'last') {
            // 删除最近画的一个
            deleted = this.canvas.deleteLastShape();
            if (deleted) {
                this.showFeedback('已删除最近的图形', 'success');
                this.tts.speak('删掉了。');
            } else {
                this.showFeedback('没有可删除的图形', 'error');
                this.tts.speak('画布上没有图形。');
            }
            return;
        }

        // 按属性匹配删除
        const matchFn = (shape) => {
            // 形状类型匹配
            if (cmd.shape) {
                const shapeTypeMap = {
                    'circle': ['circle'], 'rect': ['rect'], 'triangle': ['triangle'],
                    'star': ['star'], 'heart': ['heart'], 'arrow': ['arrow'],
                    'ellipse': ['ellipse'], 'line': ['line', 'hline', 'vline'],
                    'hline': ['hline'], 'vline': ['vline'],
                };
                const matchTypes = shapeTypeMap[cmd.shape] || [cmd.shape];
                if (!matchTypes.includes(shape.type)) return false;
            }
            // 颜色匹配
            if (cmd.color && shape.color.toUpperCase() !== cmd.color.toUpperCase()) return false;
            // 区域匹配
            if (cmd.region && shape.region !== cmd.region) return false;
            return true;
        };

        deleted = this.canvas.deleteShape(matchFn);

        if (deleted) {
            // 构建反馈描述
            const parts = [];
            if (cmd.color) {
                const c = this.parser.colorEntries.find(([k, v]) => v === cmd.color);
                if (c) parts.push(c[0]);
            }
            if (cmd.shape) {
                const s = this.parser.shapeEntries.find(([k, v]) => v === cmd.shape);
                if (s) parts.push(s[0]);
            }
            if (cmd.region) {
                const r = this.parser.regionEntries.find(([k, v]) => v === cmd.region);
                if (r) parts.push('在' + r[0]);
            }
            const desc = parts.length > 0 ? parts.join('') : '图形';
            this.showFeedback(`已删除${desc}`, 'success');
            this.tts.speak('删掉了。');
        } else {
            this.showFeedback('未找到匹配的图形', 'error');
            this.tts.speak('没有找到符合条件的图形。');
        }
    }

    cmdStartDraw() {
        this.canvas.startFreeDraw();
        this.el.penIndicator.classList.remove('hidden');
        this.showFeedback('自由画笔已开启', 'info');
        this.tts.speak('画笔已开启，请用方向指令控制。');
    }

    cmdStopDraw() {
        this.canvas.stopFreeDraw();
        this.el.penIndicator.classList.add('hidden');
        this.showFeedback('自由画笔已停止', 'info');
        this.tts.speak('已停止。');
    }

    cmdMove(cmd) {
        if (!this.canvas.isFreeDrawing) {
            this.showFeedback('请先说"开始画"', 'error');
            this.tts.speak('请先说开始画。');
            return;
        }

        this.canvas.movePen(cmd.direction);
        this.showFeedback(`→ ${cmd.label}`, 'info');
        // 方向移动不播报，避免频繁打断
    }

    cmdColor(cmd) {
        this.canvas.setColor(cmd.color);
        this.updateStatusBar();

        const colorName = cmd.label || this.getColorName(cmd.color);
        this.showFeedback(`颜色: ${colorName}`, 'success');
        this.tts.speak(`${colorName}。`);
    }

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
            desc = `${newSize}`;
        }

        this.canvas.setShapeSize(newSize);
        this.canvas.setBrushSize(Math.max(1, Math.round(newSize / 10)));
        this.updateStatusBar();

        this.showFeedback(`大小: ${desc}`, 'success');
        this.tts.speak(`好的，${desc}。`);
    }

    cmdUndo() {
        if (this.canvas.undo()) {
            this.showFeedback('已撤销', 'success');
            this.tts.speak('撤销了。');
        } else {
            this.showFeedback('无法撤销', 'error');
            this.tts.speak('没有可撤销的了。');
        }
    }

    cmdRedo() {
        if (this.canvas.redo()) {
            this.showFeedback('已重做', 'success');
            this.tts.speak('重做了。');
        } else {
            this.showFeedback('无法重做', 'error');
            this.tts.speak('没有可重做的了。');
        }
    }

    cmdClear() {
        this.canvas.clearCanvas(true);
        this.showFeedback('画布已清除', 'success');
        this.tts.speak('清除了。');
    }

    cmdSave() {
        this.canvas.saveImage();
        this.showFeedback('图片已保存', 'success');
        this.tts.speak('已保存。');
    }

    cmdHelp() {
        if (!this.showHelp) this.toggleHelp();
        this.tts.speak('已打开帮助，可以说画圆、画方、画线，也可以说颜色和大小。');
    }

    cmdReadCanvas() {
        const descriptions = this.canvas.getShapesDescription();

        if (!descriptions || descriptions.length === 0) {
            this.showFeedback('画布上没有图形', 'info');
            this.tts.speak('画布上没有图形。');
            return;
        }

        const shapeNameMap = {
            'circle': '圆形', 'ellipse': '椭圆', 'rect': '矩形',
            'triangle': '三角形', 'star': '五角星', 'heart': '爱心',
            'arrow': '箭头', 'line': '线条', 'hline': '横线', 'vline': '竖线',
            'text': '文字',
        };

        const parts = this.canvas.shapes.map((s) => {
            const regionLabel = this.canvas.getRegionLabel(s.region || s.startRegion || 'center');
            const colorName = this.getColorName(s.color);
            const shapeName = shapeNameMap[s.type] || s.type;

            if (s.type === 'text') {
                return `${regionLabel}有文字"${s.content}"`;
            }
            if (s.type === 'line' && s.startRegion) {
                const r1 = this.canvas.getRegionLabel(s.startRegion);
                const r2 = this.canvas.getRegionLabel(s.endRegion);
                return `${colorName}线条从${r1}到${r2}`;
            }
            return `${regionLabel}有一个${colorName}${shapeName}`;
        });

        const summary = `画布上有${descriptions.length}个图形`;
        const detail = parts.join('、');
        const fullText = `${summary}，${detail}。`;

        this.showFeedback(summary + '，' + detail, 'success');
        this.tts.speak(fullText);
    }

    // ============================================================
    // UI 更新
    // ============================================================

    updateStatusBar() {
        const toolNames = {
            'pen': '画笔', 'line': '直线', 'rect': '矩形',
            'circle': '圆形', 'eraser': '橡皮擦',
        };
        this.el.statusTool.textContent = toolNames[this.canvas.currentTool] || '画笔';

        const colorName = this.getColorName(this.canvas.currentColor);
        this.el.statusColor.textContent = colorName;
        this.el.statusColorDot.style.background = this.canvas.currentColor;

        this.el.statusSize.textContent = this.canvas.shapeSize;
    }

    toggleHelp() {
        this.showHelp = !this.showHelp;
        this.el.helpPanel.classList.toggle('hidden', !this.showHelp);
    }

    showFeedback(text, type = 'info') {
        const item = document.createElement('div');
        item.className = `feedback-item ${type}`;
        item.textContent = text;

        this.el.voiceFeedback.appendChild(item);

        while (this.el.voiceFeedback.children.length > 3) {
            this.el.voiceFeedback.removeChild(this.el.voiceFeedback.firstChild);
        }

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

// 启动
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
