/**
 * 纯语音控制绘图工具 - 语音模块（优化版）
 *
 * 优化重点：
 * 1. TTS 期间暂停语音识别，防止回声干扰
 * 2. 命令解析支持自然语言、多种语序、填充词过滤
 * 3. 防抖机制，避免重复识别同一条命令
 * 4. 智能重试，识别失败时给出更友好的提示
 */

// ============================================================
// 1. 语音识别模块
// ============================================================
class SpeechRecognitionModule {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.shouldBeListening = false;
        this.isPaused = false; // 被外部暂停（如TTS播放中）
        this.onResult = null;
        this.onStart = null;
        this.onEnd = null;
        this.onError = null;
        this.onInterim = null;
        this.restartTimer = null;

        // 防重复：记录最近处理的命令文本和时间
        this.lastProcessedText = '';
        this.lastProcessedTime = 0;
        this.duplicateThreshold = 3000; // 3秒内的相同文本视为重复

        this.initRecognition();
    }

    initRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error('当前浏览器不支持语音识别');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'zh-CN';
        this.recognition.interimResults = true;
        this.recognition.continuous = true;
        this.recognition.maxAlternatives = 3;

        this.recognition.onstart = () => {
            this.isListening = true;
            if (this.onStart) this.onStart();
        };

        this.recognition.onresult = (event) => {
            // 如果被暂停（TTS播放中），忽略所有识别结果
            if (this.isPaused) return;

            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (interimTranscript && this.onInterim) {
                this.onInterim(interimTranscript);
            }

            if (finalTranscript && this.onResult) {
                const text = finalTranscript.trim();
                // 防重复检查
                if (this.isDuplicate(text)) {
                    console.log('忽略重复命令:', text);
                    return;
                }
                this.lastProcessedText = text;
                this.lastProcessedTime = Date.now();
                this.onResult(text);
            }
        };

        this.recognition.onerror = (event) => {
            console.warn('语音识别错误:', event.error);
            if (event.error === 'no-speech' || event.error === 'aborted') {
                this.tryRestart();
                return;
            }
            if (this.onError) this.onError(event.error);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.onEnd) this.onEnd();
            // 如果应该持续监听且未被暂停，自动重启
            if (this.shouldBeListening && !this.isPaused) {
                this.tryRestart();
            }
        };
    }

    /**
     * 检查是否为重复命令
     */
    isDuplicate(text) {
        const now = Date.now();
        // 完全相同且在阈值内
        if (text === this.lastProcessedText && (now - this.lastProcessedTime) < this.duplicateThreshold) {
            return true;
        }
        // 去除语气词后相同（如"画一个圆"和"画一个圆吧"）
        const clean = s => s.replace(/[吧啊呢哦嗯呀哈了的]/g, '');
        if (clean(text) === clean(this.lastProcessedText) && (now - this.lastProcessedTime) < this.duplicateThreshold) {
            return true;
        }
        return false;
    }

    tryRestart() {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
            if (this.shouldBeListening && !this.isListening && !this.isPaused) {
                try {
                    this.recognition.start();
                } catch (e) {
                    console.warn('重启语音识别失败:', e);
                }
            }
        }, 300);
    }

    /**
     * 暂停识别（TTS播放时调用）
     */
    pause() {
        this.isPaused = true;
        if (this.recognition && this.isListening) {
            try {
                this.recognition.stop();
            } catch (e) { /* ignore */ }
        }
        if (this.restartTimer) clearTimeout(this.restartTimer);
    }

    /**
     * 恢复识别（TTS播放结束后调用）
     */
    resume() {
        this.isPaused = false;
        if (this.shouldBeListening && !this.isListening) {
            this.tryRestart();
        }
    }

    start() {
        if (!this.recognition) return false;
        this.shouldBeListening = true;
        this.isPaused = false;
        try {
            this.recognition.start();
            return true;
        } catch (e) {
            console.warn('启动语音识别失败:', e);
            return false;
        }
    }

    stop() {
        this.shouldBeListening = false;
        this.isPaused = false;
        if (this.restartTimer) clearTimeout(this.restartTimer);
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }

    toggle() {
        if (this.isListening || this.shouldBeListening) {
            this.stop();
        } else {
            this.start();
        }
    }
}


// ============================================================
// 2. TTS 语音反馈模块（优化版：支持暂停/恢复回调）
// ============================================================
class SpeechSynthesisModule {
    constructor() {
        this.enabled = true;
        this.queue = [];
        this.speaking = false;
        this.rate = 1.1;  // 略快语速，减少播放时间
        this.pitch = 1.0;
        this.volume = 0.9;

        // 回调：TTS 开始/结束时通知外部
        this.onSpeakStart = null;
        this.onSpeakEnd = null;

        this.voice = null;
        this.loadVoice();
    }

    loadVoice() {
        const loadVoices = () => {
            const voices = speechSynthesis.getVoices();
            this.voice = voices.find(v => v.lang.startsWith('zh')) ||
                         voices.find(v => v.lang.startsWith('zh-CN')) ||
                         voices[0] || null;
        };
        loadVoices();
        speechSynthesis.onvoiceschanged = loadVoices;
    }

    speak(text, priority = false) {
        if (!this.enabled || !text) return;

        if (priority) {
            speechSynthesis.cancel();
            this.queue = [];
            this.speaking = false;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = this.rate;
        utterance.pitch = this.pitch;
        utterance.volume = this.volume;
        if (this.voice) utterance.voice = this.voice;

        utterance.onstart = () => {
            this.speaking = true;
            if (this.onSpeakStart) this.onSpeakStart();
        };

        utterance.onend = () => {
            this.speaking = false;
            if (this.onSpeakEnd) this.onSpeakEnd();
            this.processQueue();
        };

        utterance.onerror = () => {
            this.speaking = false;
            if (this.onSpeakEnd) this.onSpeakEnd();
            this.processQueue();
        };

        if (this.speaking) {
            this.queue.push(utterance);
        } else {
            speechSynthesis.speak(utterance);
        }
    }

    processQueue() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            speechSynthesis.speak(next);
        }
    }

    cancel() {
        speechSynthesis.cancel();
        this.queue = [];
        this.speaking = false;
        if (this.onSpeakEnd) this.onSpeakEnd();
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) this.cancel();
        return this.enabled;
    }
}


// ============================================================
// 3. 自然语言命令解析器（优化版）
// ============================================================
class VoiceCommandParser {
    constructor() {
        // ========== 图形类型映射（按长度降序，优先匹配长词） ==========
        this.shapeEntries = [
            ['五角星', 'star'], ['三角形', 'triangle'], ['椭圆', 'ellipse'],
            ['长方形', 'rect'], ['正方形', 'rect'], ['水平线', 'hline'],
            ['垂直线', 'vline'], ['爱心', 'heart'], ['箭头', 'arrow'],
            ['圆形', 'circle'], ['圆圈', 'circle'], ['矩形', 'rect'],
            ['方形', 'rect'], ['三角', 'triangle'], ['星形', 'star'],
            ['心形', 'heart'], ['横线', 'hline'], ['竖线', 'vline'],
            ['直线', 'line'], ['画线', 'line'], ['线条', 'line'],
            ['圆球', 'circle'], ['正圆', 'circle'], ['方块', 'rect'],
            ['圆', 'circle'], ['方', 'rect'], ['线', 'line'],
            ['星', 'star'], ['心', 'heart'], ['箭', 'arrow'],
            ['道', 'line'], ['杠', 'line'], ['横杠', 'hline'],
            // 同义词
            ['蛋', 'circle'], ['球', 'circle'], ['饼', 'circle'], ['盘子', 'circle'],
            ['盒子', 'rect'], ['窗户', 'rect'], ['门', 'rect'],
        ];

        // ========== 颜色映射（按长度降序） ==========
        this.colorEntries = [
            ['咖啡色', '#6F4E37'], ['粉紫色', '#DA70D6'], ['天蓝色', '#87CEEB'],
            ['浅绿色', '#90EE90'], ['浅蓝色', '#ADD8E6'], ['深绿色', '#006400'],
            ['深蓝色', '#00008B'], ['深灰色', '#404040'], ['浅灰色', '#C0C0C0'],
            ['草绿色', '#7CFC00'], ['深红色', '#8B0000'], ['暗红色', '#8B0000'],
            ['粉红色', '#FF69B4'], ['褐色', '#8B4513'], ['棕色', '#A05223'],
            ['银色', '#C0C0C0'], ['金色', '#FFD700'], ['青色', '#00FFFF'],
            ['紫色', '#800080'], ['粉色', '#FF69B4'], ['橙色', '#FFA500'],
            ['灰色', '#808080'], ['红色', '#FF0000'], ['大红', '#FF0000'],
            ['蓝色', '#0000FF'], ['绿色', '#00AA00'], ['黄色', '#FFD700'],
            ['黑色', '#000000'], ['白色', '#FFFFFF'],
            ['深红', '#8B0000'], ['暗红', '#8B0000'], ['粉紫', '#DA70D6'],
            ['深绿', '#006400'], ['浅绿', '#90EE90'], ['深蓝', '#00008B'],
            ['浅蓝', '#ADD8E6'], ['天蓝', '#87CEEB'], ['草绿', '#7CFC00'],
            ['粉红', '#FF69B4'], ['深灰', '#404040'], ['浅灰', '#C0C0C0'],
            ['大红', '#FF0000'], ['棕', '#A05223'],
            ['红', '#FF0000'], ['蓝', '#0000FF'], ['绿', '#00AA00'],
            ['黄', '#FFD700'], ['黑', '#000000'], ['白', '#FFFFFF'],
            ['紫', '#800080'], ['粉', '#FF69B4'], ['橙', '#FFA500'],
            ['灰', '#808080'], ['青', '#00FFFF'],
        ];

        // ========== 区域映射（按长度降序） ==========
        this.regionEntries = [
            ['左上角', 'top-left'], ['右上角', 'top-right'],
            ['左下角', 'bottom-left'], ['右下角', 'bottom-right'],
            ['上面左边', 'top-left'], ['上面右边', 'top-right'],
            ['下面左边', 'bottom-left'], ['下面右边', 'bottom-right'],
            ['左上方', 'top-left'], ['右上方', 'top-right'],
            ['左下方', 'bottom-left'], ['右下方', 'bottom-right'],
            ['中间偏左', 'center-left'], ['中间偏右', 'center-right'],
            ['正中间', 'center'], ['中央', 'center'],
            ['顶部', 'top'], ['底部', 'bottom'],
            ['上方', 'top'], ['下方', 'bottom'],
            ['左上', 'top-left'], ['右上', 'top-right'],
            ['左下', 'bottom-left'], ['右下', 'bottom-right'],
            ['上面', 'top'], ['下面', 'bottom'],
            ['左边', 'left'], ['右边', 'right'],
            ['左侧', 'left'], ['右侧', 'right'],
            ['左面', 'left'], ['右面', 'right'],
            ['中间', 'center'], ['中心', 'center'],
            ['顶端', 'top'], ['底端', 'bottom'],
            ['上', 'top'], ['下', 'bottom'],
            ['左', 'left'], ['右', 'right'],
        ];

        // ========== 大小映射 ==========
        this.sizeEntries = [
            ['不大不小', 40], ['很小', 10], ['特小', 10], ['极小', 10],
            ['很大', 80], ['特大', 80], ['超大', 80],
            ['最大', 100], ['最小', 10],
            ['小一点', null], ['小一些', null], ['细一点', null], ['细一些', null],
            ['大一点', null], ['大一些', null], ['粗一点', null], ['粗一些', null],
            ['中等', 40], ['适中', 40], ['小的', 20], ['大的', 60],
            ['大', 60], ['小', 20], ['中', 40],
        ];

        // ========== 方向映射 ==========
        this.directionEntries = [
            ['往左上', { dx: -1, dy: -1 }], ['往右上', { dx: 1, dy: -1 }],
            ['往左下', { dx: -1, dy: 1 }], ['往右下', { dx: 1, dy: 1 }],
            ['向左上', { dx: -1, dy: -1 }], ['向右上', { dx: 1, dy: -1 }],
            ['向左下', { dx: -1, dy: 1 }], ['向右下', { dx: 1, dy: 1 }],
            ['往左', { dx: -1, dy: 0 }], ['往右', { dx: 1, dy: 0 }],
            ['往上', { dx: 0, dy: -1 }], ['往下', { dx: 0, dy: 1 }],
            ['向左', { dx: -1, dy: 0 }], ['向右', { dx: 1, dy: 0 }],
            ['向上', { dx: 0, dy: -1 }], ['向下', { dx: 0, dy: 1 }],
            ['左上', { dx: -1, dy: -1 }], ['右上', { dx: 1, dy: -1 }],
            ['左下', { dx: -1, dy: 1 }], ['右下', { dx: 1, dy: 1 }],
            ['左', { dx: -1, dy: 0 }], ['右', { dx: 1, dy: 0 }],
            ['上', { dx: 0, dy: -1 }], ['下', { dx: 0, dy: 1 }],
        ];

        // ========== 场景模板 ==========
        this.sceneTemplates = {
            snowman: {
                name: '雪人',
                keywords: ['雪人', '堆雪人', 'snowman'],
                shapes: [
                    { shape: 'circle', region: 'center', color: '#FFFFFF', size: 100, fill: true },
                    { shape: 'circle', region: 'center', color: '#FFFFFF', size: 70, offsetY: -70, fill: true },
                    { shape: 'circle', region: 'center', color: '#FFFFFF', size: 50, offsetY: -120, fill: true },
                    { shape: 'circle', region: 'center', color: '#000000', size: 8, offsetX: -15, offsetY: -125 },
                    { shape: 'circle', region: 'center', color: '#000000', size: 8, offsetX: 15, offsetY: -125 },
                    { shape: 'triangle', region: 'center', color: '#FFA500', size: 20, offsetY: -110 },
                    { shape: 'circle', region: 'center', color: '#000000', size: 8, offsetY: -85 },
                    { shape: 'circle', region: 'center', color: '#000000', size: 8, offsetY: -65 },
                    { shape: 'circle', region: 'center', color: '#000000', size: 8, offsetY: -45 },
                    { shape: 'hline', region: 'center', color: '#8B4513', size: 35, offsetY: -135 },
                    { shape: 'rect', region: 'center', color: '#8B4513', size: 30, offsetY: -150, fill: true },
                ],
            },
            starnight: {
                name: '星空',
                keywords: ['星空', '夜晚星空', 'starry'],
                shapes: [
                    { shape: 'rect', region: 'center', color: '#0a0a2e', size: 300, fill: true },
                    { shape: 'circle', region: 'top-right', color: '#FFD700', size: 60, fill: true },
                    { shape: 'circle', region: 'top-right', color: '#0a0a2e', size: 50, offsetX: 12, offsetY: -12, fill: true },
                    { shape: 'star', region: 'top-left', color: '#FFD700', size: 16 },
                    { shape: 'star', region: 'top', color: '#FFFFFF', size: 12 },
                    { shape: 'star', region: 'center-left', color: '#FFD700', size: 20 },
                    { shape: 'star', region: 'center-right', color: '#FFFFFF', size: 14 },
                    { shape: 'star', region: 'bottom-left', color: '#FFD700', size: 10 },
                    { shape: 'star', region: 'bottom-right', color: '#FFFFFF', size: 18 },
                    { shape: 'star', region: 'center', color: '#FFD700', size: 12 },
                ],
            },
            house: {
                name: '房子',
                keywords: ['房子', '小房子', '房屋', 'house'],
                shapes: [
                    { shape: 'rect', region: 'center', color: '#DEB887', size: 120, offsetY: 30, fill: true },
                    { shape: 'triangle', region: 'center', color: '#8B0000', size: 140, offsetY: -50 },
                    { shape: 'rect', region: 'center', color: '#8B4513', size: 30, offsetY: 60, fill: true },
                    { shape: 'rect', region: 'center', color: '#87CEEB', size: 25, offsetX: -35, offsetY: 10, fill: true },
                    { shape: 'rect', region: 'center', color: '#87CEEB', size: 25, offsetX: 35, offsetY: 10, fill: true },
                    { shape: 'rect', region: 'center', color: '#FFD700', size: 6, offsetX: -35, offsetY: 10 },
                    { shape: 'rect', region: 'center', color: '#FFD700', size: 6, offsetX: 35, offsetY: 10 },
                    { shape: 'rect', region: 'center', color: '#8B4513', size: 10, offsetX: 35, offsetY: -20, fill: true },
                ],
            },
            garden: {
                name: '花园',
                keywords: ['花园', '花丛', 'garden'],
                shapes: [
                    { shape: 'rect', region: 'bottom', color: '#228B22', size: 200, fill: true },
                    { shape: 'circle', region: 'top-right', color: '#FFD700', size: 50, fill: true },
                    { shape: 'circle', region: 'bottom-left', color: '#FF69B4', size: 24, fill: true },
                    { shape: 'circle', region: 'bottom-left', color: '#FF1493', size: 12, fill: true },
                    { shape: 'vline', region: 'bottom-left', color: '#228B22', size: 30, offsetY: -30 },
                    { shape: 'circle', region: 'bottom', color: '#FF0000', size: 24, fill: true },
                    { shape: 'circle', region: 'bottom', color: '#FFD700', size: 12, fill: true },
                    { shape: 'vline', region: 'bottom', color: '#228B22', size: 30, offsetY: -30 },
                    { shape: 'circle', region: 'bottom-right', color: '#DA70D6', size: 24, fill: true },
                    { shape: 'circle', region: 'bottom-right', color: '#FFD700', size: 12, fill: true },
                    { shape: 'vline', region: 'bottom-right', color: '#228B22', size: 30, offsetY: -30 },
                    { shape: 'star', region: 'top-left', color: '#FFD700', size: 14 },
                    { shape: 'star', region: 'center-left', color: '#FFFFFF', size: 10 },
                ],
            },
            smiley: {
                name: '笑脸',
                keywords: ['笑脸', '表情', '微笑', 'smiley'],
                shapes: [
                    { shape: 'circle', region: 'center', color: '#FFD700', size: 140, fill: true },
                    { shape: 'circle', region: 'center', color: '#000000', size: 18, offsetX: -30, offsetY: -20 },
                    { shape: 'circle', region: 'center', color: '#000000', size: 18, offsetX: 30, offsetY: -20 },
                    { shape: 'circle', region: 'center', color: '#4169E1', size: 10, offsetX: -30, offsetY: -20, fill: true },
                    { shape: 'circle', region: 'center', color: '#4169E1', size: 10, offsetX: 30, offsetY: -20, fill: true },
                    { shape: 'circle', region: 'center', color: '#FFFFFF', size: 5, offsetX: -26, offsetY: -24, fill: true },
                    { shape: 'circle', region: 'center', color: '#FFFFFF', size: 5, offsetX: 34, offsetY: -24, fill: true },
                    { shape: 'circle', region: 'center', color: '#FFA500', size: 14, offsetY: 5, fill: true },
                    { shape: 'circle', region: 'center', color: '#FF0000', size: 6, offsetX: -10, offsetY: 18, fill: true },
                    { shape: 'circle', region: 'center', color: '#FF0000', size: 6, offsetX: 10, offsetY: 18, fill: true },
                    { shape: 'hline', region: 'center', color: '#000000', size: 30, offsetX: -15, offsetY: 25 },
                    { shape: 'hline', region: 'center', color: '#000000', size: 30, offsetX: 15, offsetY: 25 },
                ],
            },
            rainbow: {
                name: '彩虹',
                keywords: ['彩虹', 'rainbow'],
                shapes: [
                    { shape: 'circle', region: 'center', color: '#FF0000', size: 180, offsetY: 80 },
                    { shape: 'circle', region: 'center', color: '#FFA500', size: 160, offsetY: 80 },
                    { shape: 'circle', region: 'center', color: '#FFD700', size: 140, offsetY: 80 },
                    { shape: 'circle', region: 'center', color: '#00AA00', size: 120, offsetY: 80 },
                    { shape: 'circle', region: 'center', color: '#0000FF', size: 100, offsetY: 80 },
                    { shape: 'circle', region: 'center', color: '#4B0082', size: 80, offsetY: 80 },
                    { shape: 'circle', region: 'center', color: '#8B008B', size: 60, offsetY: 80 },
                    { shape: 'circle', region: 'center', color: '#FFFFFF', size: 10, offsetX: -50, offsetY: 20, fill: true },
                    { shape: 'circle', region: 'center', color: '#FFFFFF', size: 10, offsetX: 60, offsetY: 10, fill: true },
                ],
            },
            cat: {
                name: '猫',
                keywords: ['猫', '小猫', '猫咪', 'cat'],
                shapes: [
                    { shape: 'circle', region: 'center', color: '#808080', size: 120, fill: true },
                    { shape: 'triangle', region: 'center', color: '#808080', size: 40, offsetX: -40, offsetY: -65 },
                    { shape: 'triangle', region: 'center', color: '#808080', size: 40, offsetX: 40, offsetY: -65 },
                    { shape: 'triangle', region: 'center', color: '#FF69B4', size: 22, offsetX: -40, offsetY: -62 },
                    { shape: 'triangle', region: 'center', color: '#FF69B4', size: 22, offsetX: 40, offsetY: -62 },
                    { shape: 'circle', region: 'center', color: '#FFFFFF', size: 28, offsetX: -25, offsetY: -10, fill: true },
                    { shape: 'circle', region: 'center', color: '#FFFFFF', size: 28, offsetX: 25, offsetY: -10, fill: true },
                    { shape: 'circle', region: 'center', color: '#90EE90', size: 18, offsetX: -25, offsetY: -10, fill: true },
                    { shape: 'circle', region: 'center', color: '#90EE90', size: 18, offsetX: 25, offsetY: -10, fill: true },
                    { shape: 'circle', region: 'center', color: '#000000', size: 10, offsetX: -25, offsetY: -10, fill: true },
                    { shape: 'circle', region: 'center', color: '#000000', size: 10, offsetX: 25, offsetY: -10, fill: true },
                    { shape: 'triangle', region: 'center', color: '#FF69B4', size: 12, offsetY: 8 },
                    { shape: 'hline', region: 'center', color: '#000000', size: 30, offsetX: -20, offsetY: 18 },
                    { shape: 'hline', region: 'center', color: '#000000', size: 30, offsetX: 20, offsetY: 18 },
                    { shape: 'hline', region: 'center', color: '#000000', size: 20, offsetY: 28 },
                ],
            },
            sun: {
                name: '太阳',
                keywords: ['太阳', 'sun'],
                shapes: [
                    { shape: 'circle', region: 'center', color: '#FFD700', size: 80, fill: true },
                    { shape: 'circle', region: 'center', color: '#FFA500', size: 60, fill: true },
                    { shape: 'hline', region: 'center', color: '#FFD700', size: 30, offsetX: -55 },
                    { shape: 'hline', region: 'center', color: '#FFD700', size: 30, offsetX: 55 },
                    { shape: 'vline', region: 'center', color: '#FFD700', size: 30, offsetY: -55 },
                    { shape: 'vline', region: 'center', color: '#FFD700', size: 30, offsetY: 55 },
                    { shape: 'hline', region: 'center', color: '#FFD700', size: 20, offsetX: -42, offsetY: -42 },
                    { shape: 'hline', region: 'center', color: '#FFD700', size: 20, offsetX: 42, offsetY: -42 },
                    { shape: 'hline', region: 'center', color: '#FFD700', size: 20, offsetX: -42, offsetY: 42 },
                    { shape: 'hline', region: 'center', color: '#FFD700', size: 20, offsetX: 42, offsetY: 42 },
                    { shape: 'circle', region: 'center', color: '#FFA500', size: 20, offsetX: -12, offsetY: -8, fill: true },
                    { shape: 'circle', region: 'center', color: '#FFA500', size: 12, offsetX: 10, offsetY: 8, fill: true },
                ],
            },
        };

        // ========== 填充词/语气词（解析前移除） ==========
        this.fillerWords = [
            '帮我', '麻烦', '请', '能不能', '可不可以',
            '我想', '我要', '你帮我', '麻烦你',
            '吧', '啊', '呢', '哦', '嗯', '呀', '哈',
            '了', '的', '得', '地',
            '那么', '然后呢', '就是', '就是说',
        ];
    }

    /**
     * 解析语音文本，返回命令数组
     */
    parse(text) {
        if (!text || !text.trim()) return [];

        // 预处理
        text = this.preprocess(text);
        if (!text) return [];

        // 拆解复合命令
        const segments = this.splitCompound(text);
        const commands = [];

        for (const seg of segments) {
            const cmd = this.parseSegment(seg);
            if (cmd) {
                if (Array.isArray(cmd)) {
                    commands.push(...cmd);
                } else {
                    commands.push(cmd);
                }
            }
        }

        return commands;
    }

    /**
     * 预处理：去除干扰文本，统一格式
     */
    preprocess(text) {
        // 去除标点和空格
        text = text.replace(/[，。！？、；：""''（）\[\]【】,.!?;:'"()\s]/g, '');

        // 去除填充词（按长度降序，避免短词误删）
        const sortedFillers = [...this.fillerWords].sort((a, b) => b.length - a.length);
        for (const filler of sortedFillers) {
            text = text.replace(new RegExp(filler, 'g'), '');
        }

        // 中文数字转阿拉伯数字
        text = this.chineseToNumber(text);

        return text;
    }

    /**
     * 中文数字转阿拉伯数字
     */
    chineseToNumber(text) {
        const numMap = [
            ['十一', 11], ['十二', 12], ['十三', 13], ['十四', 14], ['十五', 15],
            ['二十', 20], ['三十', 30], ['四十', 40], ['五十', 50],
            ['一', 1], ['二', 2], ['两', 2], ['三', 3], ['四', 4], ['五', 5],
            ['六', 6], ['七', 7], ['八', 8], ['九', 9], ['十', 10],
        ];
        for (const [cn, num] of numMap) {
            text = text.replace(new RegExp(cn, 'g'), String(num));
        }
        return text;
    }

    /**
     * 拆解复合命令
     */
    splitCompound(text) {
        // "画N个..." 模式
        const repeatMatch = text.match(/画(\d+)个(.+)/);
        if (repeatMatch) {
            const count = Math.min(parseInt(repeatMatch[1]), 10);
            const content = repeatMatch[2];
            return Array(count).fill('画一个' + content);
        }

        // 分隔符拆分
        const parts = text.split(/(?:然后|接着|再|还有|和|并且)/);
        if (parts.length > 1) {
            return parts.map(p => p.trim()).filter(p => p.length > 1);
        }

        return [text];
    }

    /**
     * 解析单个命令段
     */
    parseSegment(text) {
        if (!text || text.length < 2) return null;

        // 优先级从高到低
        return this.parseAction(text)
            || this.parseDeleteCommand(text)
            || this.parseDirection(text)
            || this.parseSizeAdjust(text)
            || this.parseColorChange(text)
            || this.parseSceneCommand(text)
            || this.parseDrawCommand(text)
            || this.parseTextCommand(text)
            || { action: 'unknown', raw: text };
    }

    /**
     * 解析操作类命令
     */
    parseAction(text) {
        if (/撤销|后退|返回上一步|上一步/.test(text)) return { action: 'undo' };
        if (/重做|前进|下一步/.test(text)) return { action: 'redo' };
        if (/清除|清空|清屏|清除画布|全部清除/.test(text)) return { action: 'clear' };
        if (/保存|保存图片|导出|存档/.test(text)) return { action: 'save' };
        if (/帮助|怎么用|你能做什么|你会什么|怎么操作|怎么玩/.test(text)) return { action: 'help' };
        if (/开始画|开始绘画|自由画|画笔模式|开始自由/.test(text)) return { action: 'start_draw' };
        if (/停止画|停|暂停|不画了|结束画|结束|好了/.test(text)) return { action: 'stop_draw' };
        return null;
    }

    /**
     * 解析删除命令
     * 支持："删除那个红色圆圈"、"删除中间的红色圆圈"、"删除刚刚的红色圆圈"、"删除最后画的"
     */
    parseDeleteCommand(text) {
        if (!/删除|去掉|移除|擦掉|不要了|撤掉/.test(text)) return null;

        // "删除最后(画的)" → 删除最近一个形状
        if (/最后|最近|刚才|刚刚/.test(text) && !this.findShape(text)) {
            return { action: 'delete', matchType: 'last' };
        }

        // 提取颜色、形状、位置
        const colorResult = this.findColor(text);
        const shapeResult = this.findShape(text);
        const region = this.findRegion(text);

        // 有形状关键词 → 按属性匹配删除
        if (shapeResult) {
            return {
                action: 'delete',
                matchType: 'byProperty',
                shape: shapeResult.shape,
                color: colorResult ? colorResult.color : null,
                region: region,
            };
        }

        // 只有颜色 → 按颜色删除
        if (colorResult) {
            return {
                action: 'delete',
                matchType: 'byProperty',
                shape: null,
                color: colorResult.color,
                region: region,
            };
        }

        // 只有位置 → 按位置删除
        if (region) {
            return {
                action: 'delete',
                matchType: 'byProperty',
                shape: null,
                color: null,
                region: region,
            };
        }

        // 无具体属性 → 删除最后一个
        return { action: 'delete', matchType: 'last' };
    }

    /**
     * 解析方向命令
     */
    parseDirection(text) {
        for (const [keyword, dir] of this.directionEntries) {
            if (text.includes(keyword)) {
                // 确保不是绘制命令的一部分（如"往左上角画一个圆"）
                if (/画|绘制|来|放/.test(text)) return null;
                return { action: 'move', direction: dir, label: keyword };
            }
        }
        return null;
    }

    /**
     * 解析大小调整命令
     */
    parseSizeAdjust(text) {
        // 相对调整
        if (/大一点|大一些|粗一点|粗一些|变大|加大|放大/.test(text))
            return { action: 'size', value: 'bigger' };
        if (/小一点|小一些|细一点|细一些|变小|缩小|减小/.test(text))
            return { action: 'size', value: 'smaller' };
        if (/最大/.test(text)) return { action: 'size', value: 100 };
        if (/最小/.test(text)) return { action: 'size', value: 10 };

        // 精确数值
        const numMatch = text.match(/(?:大小|画笔|粗细|尺寸|设置|直径|半径|宽度)(\d+)/);
        if (numMatch) return { action: 'size', value: parseInt(numMatch[1]) };

        return null;
    }

    /**
     * 解析纯颜色切换命令（不含形状）
     */
    parseColorChange(text) {
        // 只有当文本中没有形状关键词时才认为是纯颜色切换
        if (this.findShape(text)) return null;

        for (const [keyword, color] of this.colorEntries) {
            if (text === keyword || text === '换' + keyword || text === '变成' + keyword
                || text === '用' + keyword || text === '换成' + keyword) {
                return { action: 'color', color, label: keyword };
            }
        }
        return null;
    }

    /**
     * 解析绘制命令（最复杂）
     * 支持多种语序：
     *   "画一个红色圆形在中间"
     *   "在中间画一个红色圆形"
     *   "画一个圆，红色的，在中间"
     *   "帮我画个大一点的蓝色矩形放右上角"
     */
    parseDrawCommand(text) {
        // 提取形状
        const shapeResult = this.findShape(text);
        if (!shapeResult) return null;
        const { shape, label: shapeLabel } = shapeResult;

        // 提取颜色
        const colorResult = this.findColor(text);
        const color = colorResult ? colorResult.color : null;

        // 提取大小
        let size = this.findSize(text);
        if (size === null) {
            const numMatch = text.match(/(?:大小|直径|半径|宽度|高度|尺寸)(\d+)/);
            if (numMatch) size = parseInt(numMatch[1]);
        }

        // 提取位置
        const region = this.findRegion(text);

        // 线条特殊处理
        if (shape === 'line') {
            const lineMatch = text.match(/从(.+?)到(.+)/);
            if (lineMatch) {
                const startRegion = this.findRegion(lineMatch[1]);
                const endRegion = this.findRegion(lineMatch[2]);
                if (startRegion && endRegion) {
                    return {
                        action: 'draw', shape: 'line', color, size,
                        startRegion, endRegion,
                        label: `从${lineMatch[1]}到${lineMatch[2]}的线`
                    };
                }
            }
        }

        if (shape === 'hline' || shape === 'vline') {
            return {
                action: 'draw', shape, color, size,
                region: region || 'center',
                label: shape === 'hline' ? '横线' : '竖线'
            };
        }

        return {
            action: 'draw', shape, color, size,
            region: region || 'center',
            label: shapeLabel
        };
    }

    /**
     * 从文本中查找形状
     */
    findShape(text) {
        for (const [keyword, shape] of this.shapeEntries) {
            if (text.includes(keyword)) {
                return { shape, label: keyword };
            }
        }
        return null;
    }

    /**
     * 从文本中查找颜色
     */
    findColor(text) {
        for (const [keyword, color] of this.colorEntries) {
            if (text.includes(keyword)) {
                return { color, label: keyword };
            }
        }
        return null;
    }

    /**
     * 从文本中查找区域
     */
    findRegion(text) {
        for (const [keyword, region] of this.regionEntries) {
            if (text.includes(keyword)) return region;
        }
        return null;
    }

    /**
     * 从文本中查找大小
     */
    findSize(text) {
        for (const [keyword, size] of this.sizeEntries) {
            if (text.includes(keyword)) return size;
        }
        return null;
    }

    /**
     * 解析场景命令（如"画一个雪人"、"画一片星空"）
     */
    parseSceneCommand(text) {
        for (const [templateKey, template] of Object.entries(this.sceneTemplates)) {
            for (const keyword of template.keywords) {
                if (text.includes(keyword)) {
                    return {
                        action: 'scene',
                        template: templateKey,
                        label: template.name,
                        shapes: template.shapes,
                    };
                }
            }
        }
        return null;
    }

    /**
     * 解析文字标注命令
     */
    parseTextCommand(text) {
        const match = text.match(/(?:写上|写|标注|写个|标上)(.+?)(?:在(.+))?$/);
        if (match) {
            const content = match[1];
            const region = match[2] ? this.findRegion(match[2]) : null;
            return {
                action: 'text',
                content,
                region: region || 'center'
            };
        }
        return null;
    }

    /**
     * 生成命令的中文描述（用于TTS反馈）
     */
    describeCommand(cmd) {
        if (!cmd) return '';

        switch (cmd.action) {
            case 'draw': {
                const parts = [];
                if (cmd.color) {
                    const c = this.colorEntries.find(([k, v]) => v === cmd.color);
                    if (c) parts.push(c[0]);
                }
                if (cmd.size) {
                    const s = this.sizeEntries.find(([k, v]) => v === cmd.size);
                    if (s) parts.push(s[0]);
                }
                const sh = this.shapeEntries.find(([k, v]) => v === cmd.shape);
                parts.push(sh ? sh[0] : cmd.shape);

                if (cmd.startRegion && cmd.endRegion) {
                    const r1 = this.regionEntries.find(([k, v]) => v === cmd.startRegion);
                    const r2 = this.regionEntries.find(([k, v]) => v === cmd.endRegion);
                    return `从${r1 ? r1[0] : ''}到${r2 ? r2[0] : ''}画一条${parts.join('')}`;
                }
                const rn = this.regionEntries.find(([k, v]) => v === cmd.region);
                return `在${rn ? rn[0] : '中间'}画一个${parts.join('')}`;
            }
            case 'text':
                return `在${cmd.region === 'center' ? '中间' : cmd.region}写上${cmd.content}`;
            case 'undo': return '撤销';
            case 'redo': return '重做';
            case 'clear': return '清除画布';
            case 'save': return '保存图片';
            case 'color': {
                const c = this.colorEntries.find(([k, v]) => v === cmd.color);
                return `切换为${c ? c[0] : '新颜色'}`;
            }
            case 'size':
                if (cmd.value === 'bigger') return '变大';
                if (cmd.value === 'smaller') return '变小';
                return `大小${cmd.value}`;
            case 'scene': return `绘制${cmd.label}场景`;
            case 'start_draw': return '开始自由绘画';
            case 'stop_draw': return '停止自由绘画';
            case 'help': return '帮助';
            case 'move': return `向${cmd.label}移动`;
            default: return '执行命令';
        }
    }
}


// ============================================================
// 4. 命令历史记录
// ============================================================
class CommandHistory {
    constructor(maxSize = 100) {
        this.history = [];
        this.maxSize = maxSize;
    }

    push(command) {
        this.history.push({
            command,
            timestamp: Date.now()
        });
        if (this.history.length > this.maxSize) {
            this.history.shift();
        }
    }

    getLast(n = 5) {
        return this.history.slice(-n);
    }

    clear() {
        this.history = [];
    }
}


// ============================================================
// 导出
// ============================================================
window.SpeechRecognitionModule = SpeechRecognitionModule;
window.SpeechSynthesisModule = SpeechSynthesisModule;
window.VoiceCommandParser = VoiceCommandParser;
window.CommandHistory = CommandHistory;
