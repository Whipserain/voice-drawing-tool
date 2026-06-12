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

        // TTS 冷却期
        this.ttsCooldown = 800;
        this.ttsCooldownTimer = null;

        // 智能句子边界检测
        this.lastFinalTime = 0;

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
                const now = Date.now();

                // 智能句子边界检测：500ms 内的连续 final 结果可能是 TTS 回声
                if (this.lastFinalTime > 0 && (now - this.lastFinalTime) < 500) {
                    console.log('忽略快速连续结果（可能回声）:', text);
                    this.lastFinalTime = now;
                    return;
                }
                this.lastFinalTime = now;

                // 防重复检查
                if (this.isDuplicate(text)) {
                    console.log('忽略重复命令:', text);
                    return;
                }
                this.lastProcessedText = text;
                this.lastProcessedTime = now;
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
        if ((now - this.lastProcessedTime) > this.duplicateThreshold) return false;
        // 完全相同
        if (text === this.lastProcessedText) return true;
        // 去除语气词后相同
        const clean = s => s.replace(/[吧啊呢哦嗯呀哈了的]/g, '');
        if (clean(text) === clean(this.lastProcessedText)) return true;
        // 编辑距离 <= 2 视为重复（处理 ASR 微小差异）
        if (this.editDistance(text, this.lastProcessedText) <= 2) return true;
        return false;
    }

    /**
     * 计算两个字符串的编辑距离（Levenshtein Distance）
     */
    editDistance(a, b) {
        if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
            }
        }
        return dp[m][n];
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
        if (this.ttsCooldownTimer) clearTimeout(this.ttsCooldownTimer);
        // TTS 结束后等待 ttsCooldown 再恢复识别，防止尾音被拾取
        this.ttsCooldownTimer = setTimeout(() => {
            if (this.shouldBeListening && !this.isListening) {
                this.tryRestart();
            }
        }, this.ttsCooldown);
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
        // 从 commands.js 的 COMMAND_CONFIG 读取映射数据
        const cfg = window.COMMAND_CONFIG || {};
        this.shapeEntries = cfg.shapeEntries || [];
        this.colorEntries = cfg.colorEntries || [];
        this.regionEntries = cfg.regionEntries || [];
        this.sizeEntries = cfg.sizeEntries || [];
        this.directionEntries = cfg.directionEntries || [];
        this.shapePathTemplates = cfg.shapePathTemplates || [];
        this.penTypeEntries = cfg.penTypeEntries || [];
        this.fillerWords = cfg.fillerWords || [];
        this.sceneTemplates = window.SCENE_TEMPLATES || {};

        // 口语化同义词（从 commands.js 加载）
        this.colloquialSynonyms = window.COLLOQUIAL_SYNONYMS || {};

        // 纠错命令词汇
        this.errorCorrectionWords = window.ERROR_CORRECTION_WORDS || [];
    }

    /**
     * 解析语音文本，返回命令数组
     */
    parse(text, currentColor) {
        if (!text || !text.trim()) return [];

        // 预处理
        text = this.preprocess(text);
        if (!text) return [];

        // 拆解复合命令
        const segments = this.splitCompound(text);
        const commands = [];

        for (const seg of segments) {
            const cmd = this.parseSegment(seg, currentColor);
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

        // 口语化同义词替换（按长度降序）
        const sortedSynonyms = Object.entries(this.colloquialSynonyms)
            .sort((a, b) => b[0].length - a[0].length);
        for (const [from, to] of sortedSynonyms) {
            if (text.includes(from)) {
                // 对于形状和颜色同义词，替换后保留原位置信息
                text = text.replace(from, to);
            }
        }

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
    parseSegment(text, currentColor) {
        if (!text || text.length < 2) return null;

        // 使用 ParserRegistry 链式解析（各解析器在 commands.js 中注册）
        if (window.ParserRegistry && window.ParserRegistry.parsers.length > 0) {
            return window.ParserRegistry.parse(this, text, currentColor);
        }

        // 兜底：如果 Registry 未初始化，使用内置链
        return this.parseErrorCorrection(text)
            || this.parseAction(text)
            || this.parseDeleteCommand(text)
            || this.parseDirection(text)
            || this.parsePenTypeCommand(text)
            || this.parseSizeAdjust(text)
            || this.parseColorAdjustment(text, currentColor)
            || this.parseRGBColorCommand(text)
            || this.parseColorChange(text)
            || this.parseMoveShapeCommand(text)
            || this.parseComplexCommand(text)
            || this.parsePatternCommand(text)
            || this.parseSceneCommand(text)
            || this.parseDrawCommand(text)
            || this.parseTextCommand(text)
            || { action: 'unknown', raw: text };
    }

    /**
     * 解析形状连接命令
     * "把红色圆和蓝色方连起来" → connect
     * "连接左边和右边" → connect
     * "...连到..." → connect
     */
    /**
     * 解析纠错命令
     * "不对"、"画错了"、"不是这个意思" → error_correction
     */
    parseErrorCorrection(text) {
        for (const word of this.errorCorrectionWords) {
            if (text.includes(word)) {
                return { action: 'error_correction', raw: word };
            }
        }
        return null;
    }

    parseConnectCommand(text) {
        if (!/连接|连起来|连到/.test(text)) return null;

        // "把A和B连起来" / "连接A和B" / "A连到B"
        const match = text.match(/(?:把)?(.+?)(?:和|跟|与)(.+?)(?:连起来|连接|连到)/)
            || text.match(/(?:连接)(.+?)(?:和|跟|与)(.+)/)
            || text.match(/(.+?)(?:连到)(.+)/);

        if (!match) return null;

        const fromDesc = match[1];
        const toDesc = match[2];

        const fromColor = this.findColor(fromDesc);
        const fromShape = this.findShape(fromDesc);
        const fromRegion = this.findRegion(fromDesc);

        const toColor = this.findColor(toDesc);
        const toShape = this.findShape(toDesc);
        const toRegion = this.findRegion(toDesc);

        return {
            action: 'connect',
            from: {
                color: fromColor ? fromColor.color : null,
                shape: fromShape ? fromShape.shape : null,
                region: fromRegion,
            },
            to: {
                color: toColor ? toColor.color : null,
                shape: toShape ? toShape.shape : null,
                region: toRegion,
            },
        };
    }

    /**
     * 解析背景颜色命令
     * "换成黑色背景" → background
     * "白色背景" → background
     */
    parseBackgroundCommand(text) {
        if (!/背景/.test(text)) return null;

        for (const [keyword, color] of this.colorEntries) {
            if (text.includes(keyword)) {
                return { action: 'background', color, label: keyword };
            }
        }
        return null;
    }

    /**
     * 解析形状复制命令
     * "复制那个红色圆" → copy
     * "再画一个一样的" → copy
     */
    parseCopyCommand(text) {
        if (!/复制|再画一个|一样的|拷贝|再来一个/.test(text)) return null;

        const colorResult = this.findColor(text);
        const shapeResult = this.findShape(text);
        const region = this.findRegion(text);

        return {
            action: 'copy',
            shape: shapeResult ? shapeResult.shape : null,
            color: colorResult ? colorResult.color : null,
            region: region,
        };
    }

    /**
     * 解析移动形状命令
     * "移动红色圆到左边" / "把红色圆移到中间" / "把那个圆移到右边"
     */
    parseMoveShapeCommand(text) {
        if (!/移动|移到|挪到|挪动/.test(text)) return null;

        // 提取目标区域
        const region = this.findRegion(text);

        // 提取要移动的形状描述
        const colorResult = this.findColor(text);
        const shapeResult = this.findShape(text);

        if (!region) return null;

        return {
            action: 'move_shape',
            shape: shapeResult ? shapeResult.shape : null,
            color: colorResult ? colorResult.color : null,
            toRegion: region,
        };
    }

    /**
     * 解析复杂对话命令
     * "五颜六色的椭圆圆环" → 彩虹色图案
     * "圆形圆环" → 圆环形状
     */
    parseComplexCommand(text) {
        // 检测 "五颜六色的XXX" → 彩虹色
        const wuyanMatch = text.match(/五颜六色(?:的|de)?(.+)/);
        if (wuyanMatch) {
            const shapePart = wuyanMatch[1];
            const shapeResult = this.findShape(shapePart);
            const shape = shapeResult ? shapeResult.shape : 'circle';
            const region = this.findRegion(text) || 'center';
            const size = this.findSize(text);
            const rainbowColors = ['#FF0000', '#FFA500', '#FFD700', '#00AA00', '#0000FF', '#800080'];
            return {
                action: 'complex', mode: 'pattern', shape,
                colors: rainbowColors, region, size,
                segments: 12, label: `五颜六色${shapeResult ? shapeResult.label : '圆'}`
            };
        }

        // 检测 "花花绿绿的XXX" → 多色
        const huahuaMatch = text.match(/花花绿绿(?:的|de)?(.+)/);
        if (huahuaMatch) {
            const shapePart = huahuaMatch[1];
            const shapeResult = this.findShape(shapePart);
            const shape = shapeResult ? shapeResult.shape : 'circle';
            const region = this.findRegion(text) || 'center';
            const size = this.findSize(text);
            const multiColors = ['#FF0000', '#00AA00', '#0000FF', '#FFD700', '#FF69B4', '#FFA500'];
            return {
                action: 'complex', mode: 'pattern', shape,
                colors: multiColors, region, size,
                segments: 12, label: `花花绿绿${shapeResult ? shapeResult.label : '圆'}`
            };
        }

        // 检测 "圆形圆环" / "椭圆圆环" → 特殊圆环形状
        if (/圆环/.test(text)) {
            const isEllipse = /椭圆/.test(text);
            const shape = isEllipse ? 'ellipse' : 'circle';
            const region = this.findRegion(text) || 'center';
            const size = this.findSize(text) || 80;
            const colorResult = this.findColor(text);
            const color = colorResult ? colorResult.color : '#4169E1';
            return {
                action: 'complex', mode: 'ring', shape, color,
                region, size, label: isEllipse ? '椭圆圆环' : '圆形圆环'
            };
        }

        return null;
    }

    /**
     * 解析多色图案命令
     * "红绿相间的圆" → 红绿交替的圆形
     * "红蓝黄相间的矩形" → 三色交替矩形
     * "彩虹色的圆" → 彩虹渐变圆
     */
    parsePatternCommand(text) {
        // 检测 "相间" 关键词
        const xiangjianMatch = text.match(/(.+?)相间(?:的|de)?(.+)/);
        if (xiangjianMatch) {
            const colorPart = xiangjianMatch[1];
            const shapePart = xiangjianMatch[2];

            // 提取所有颜色
            const colors = [];
            let tempText = colorPart;
            // 按长度降序匹配颜色
            for (const [keyword, color] of this.colorEntries) {
                if (tempText.includes(keyword)) {
                    colors.push(color);
                    tempText = tempText.replace(keyword, '');
                }
            }

            // 提取形状
            const shapeResult = this.findShape(shapePart);
            const shape = shapeResult ? shapeResult.shape : 'circle';

            // 提取位置
            const region = this.findRegion(text) || 'center';

            // 提取大小
            let size = this.findSize(text);

            if (colors.length >= 2) {
                return {
                    action: 'pattern',
                    shape,
                    colors,
                    region,
                    size,
                    segments: colors.length * 2, // 每种颜色2个弧段，交替更明显
                    label: `${colors.length}色相间${shapeResult ? shapeResult.label : '圆'}`
                };
            }
        }

        // 检测 "彩虹色" 关键词
        if (/彩虹/.test(text)) {
            const shapeResult = this.findShape(text);
            const shape = shapeResult ? shapeResult.shape : 'circle';
            const region = this.findRegion(text) || 'center';
            const size = this.findSize(text);
            const rainbowColors = ['#FF0000', '#FFA500', '#FFD700', '#00AA00', '#0000FF', '#800080'];

            return {
                action: 'pattern',
                shape,
                colors: rainbowColors,
                region,
                size,
                segments: 6,
                label: `彩虹${shapeResult ? shapeResult.label : '圆'}`
            };
        }

        return null;
    }

    /**
     * 解析操作类命令
     */
    parseAction(text) {
        // 多步撤销："撤销三步"、"撤销全部"
        const undoStepsMatch = text.match(/撤销(\d+)步/);
        if (undoStepsMatch) return { action: 'undo', steps: parseInt(undoStepsMatch[1]) };
        if (/撤销全部|全部撤销|清空撤销/.test(text)) return { action: 'undo', steps: 999 };
        if (/撤销|后退|返回上一步|上一步/.test(text)) return { action: 'undo' };
        if (/重做|前进/.test(text)) return { action: 'redo' };

        // 教程模式
        if (/退出教程|结束教程|关闭教程/.test(text)) return { action: 'tutorial', mode: 'exit' };
        if (/下一步/.test(text)) return { action: 'tutorial', mode: 'next' };
        if (/教程|教我画画|怎么用|学习/.test(text)) return { action: 'tutorial', mode: 'start' };
        if (/清除|清空|清屏|清除画布|全部清除/.test(text)) return { action: 'clear' };
        if (/保存|保存图片|导出|存档/.test(text)) return { action: 'save' };
        if (/帮助|怎么用|你能做什么|你会什么|怎么操作|怎么玩/.test(text)) return { action: 'help' };
        if (/开始画|开始绘画|自由画|画笔模式|开始自由/.test(text)) return { action: 'start_draw' };
        if (/停止画|停|暂停|不画了|结束画|结束|好了/.test(text)) return { action: 'stop_draw' };
        if (/画布上有什么|画布内容|读取画布|描述画布|上面有什么|有什么图形|有几个图形/.test(text)) return { action: 'read_canvas' };
        if (/变整齐|排列整齐|自动排列|整齐/.test(text)) return { action: 'arrange', mode: 'grid' };
        if (/居中排列|整体居中|居中/.test(text)) return { action: 'arrange', mode: 'center' };
        if (/左对齐|靠左/.test(text)) return { action: 'arrange', mode: 'align_left' };
        if (/右对齐|靠右/.test(text)) return { action: 'arrange', mode: 'align_right' };
        if (/顶部对齐|靠上/.test(text)) return { action: 'arrange', mode: 'align_top' };
        if (/底部对齐|靠下/.test(text)) return { action: 'arrange', mode: 'align_bottom' };
        if (/水平分布|水平排列/.test(text)) return { action: 'arrange', mode: 'distribute_h' };
        if (/垂直分布|垂直排列/.test(text)) return { action: 'arrange', mode: 'distribute_v' };

        // 视口控制：缩放
        if (/放大画布|放大|拉近/.test(text)) return { action: 'viewport', mode: 'zoom_in' };
        if (/缩小画布|缩小|拉远/.test(text)) return { action: 'viewport', mode: 'zoom_out' };

        // 视口控制：复原
        if (/复原|重置视图|恢复默认|原始大小/.test(text)) return { action: 'viewport', mode: 'reset' };

        // 视口控制：平移（"看" + 区域，用"看"前缀区分绘制命令）
        const panMatch = text.match(/^看(.+)$/);
        if (panMatch) {
            const regionKeyword = panMatch[1];
            for (const [keyword, region] of this.regionEntries) {
                if (regionKeyword === keyword || regionKeyword.includes(keyword)) {
                    return { action: 'viewport', mode: 'pan', region };
                }
            }
        }

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
     * 解析方向命令（支持连续方向和重复步数）
     */
    parseDirection(text) {
        // 确保不是绘制命令的一部分（如"往左上角画一个圆"）
        // 但允许 "字形" 路径模板（如"画一个Z字形"）
        if (/画|绘制|来|放/.test(text) && !/字形|路径/.test(text)) return null;

        // 先检查形状路径模板（Z字形、方形路径等）
        for (const template of this.shapePathTemplates) {
            for (const keyword of template.keywords) {
                if (text.includes(keyword)) {
                    return {
                        action: 'move_sequence',
                        directions: template.directions,
                        steps: 1,
                        label: template.name,
                    };
                }
            }
        }

        // 尝试连续方向匹配
        const result = this.parseContinuousDirections(text);
        if (result && result.directions.length > 1) {
            return {
                action: 'move_sequence',
                directions: result.directions,
                steps: result.steps,
                label: result.label,
            };
        }

        // 单个方向
        if (result && result.directions.length === 1) {
            return { action: 'move', direction: result.directions[0], label: result.label };
        }

        // 回退：原始单方向匹配
        for (const [keyword, dir] of this.directionEntries) {
            if (text.includes(keyword)) {
                return { action: 'move', direction: dir, label: keyword };
            }
        }
        return null;
    }

    /**
     * 从文本中提取所有连续方向指令
     * @param {string} text - 预处理后的文本
     * @returns {{ directions: Array<{dx, dy}>, steps: number, label: string } | null}
     */
    parseContinuousDirections(text) {
        // 构建方向正则：按长度降序排列关键词，优先匹配长词
        const sortedEntries = [...this.directionEntries].sort((a, b) => b[0].length - a[0].length);
        const dirPattern = sortedEntries.map(([kw]) => kw).join('|');

        // 匹配所有方向关键词
        const regex = new RegExp(dirPattern, 'g');
        const matches = text.match(regex);

        if (!matches || matches.length === 0) return null;

        // 将关键词转换为方向对象
        const directions = matches.map(keyword => {
            const entry = this.directionEntries.find(([kw]) => kw === keyword);
            return entry ? entry[1] : null;
        }).filter(d => d !== null);

        if (directions.length === 0) return null;

        // 检测 "N步" 或 "N次" 模式
        let steps = 1;
        const stepsMatch = text.match(/(\d+)\s*(?:步|次)/);
        if (stepsMatch) {
            steps = Math.min(parseInt(stepsMatch[1]), 50); // 最多50步
        }

        // 生成标签
        const dirLabels = matches.map(keyword => keyword);
        const label = steps > 1
            ? `${dirLabels.join('')} ×${steps}步`
            : dirLabels.join('');

        return { directions, steps, label };
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
     * 解析画笔类型命令
     * 匹配："毛笔"、"用钢笔"、"换成铅笔"、"切换水彩笔" 等
     */
    parsePenTypeCommand(text) {
        for (const [keyword, type] of this.penTypeEntries) {
            if (text.includes(keyword)) {
                return { action: 'pen_type', type, label: keyword };
            }
        }
        return null;
    }

    /**
     * 解析 RGB 颜色命令
     * 支持格式：
     *   "RGB 255 0 0" / "rgb255,0,0"
     *   "颜色255,0,0" / "颜色值255,0,0"
     *   "色值ff0000" / "色号ff0000"
     */
    parseRGBColorCommand(text) {
        // 模式1: RGB + 三个数字（空格或逗号分隔）
        const rgbMatch = text.match(/rgb\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})/i);
        if (rgbMatch) {
            const r = Math.min(255, parseInt(rgbMatch[1]));
            const g = Math.min(255, parseInt(rgbMatch[2]));
            const b = Math.min(255, parseInt(rgbMatch[3]));
            const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
            return { action: 'color', color: hex, label: `RGB(${r},${g},${b})` };
        }

        // 模式2: 颜色/颜色值 + 三个数字
        const colorNumMatch = text.match(/(?:颜色值?|色值|色号)\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})/);
        if (colorNumMatch) {
            const r = Math.min(255, parseInt(colorNumMatch[1]));
            const g = Math.min(255, parseInt(colorNumMatch[2]));
            const b = Math.min(255, parseInt(colorNumMatch[3]));
            const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
            return { action: 'color', color: hex, label: `RGB(${r},${g},${b})` };
        }

        // 模式3: 色值/色号 + 十六进制
        const hexMatch = text.match(/(?:色值|色号|颜色)\s*([0-9a-fA-F]{6})/);
        if (hexMatch) {
            const hex = '#' + hexMatch[1].toUpperCase();
            return { action: 'color', color: hex, label: `色值${hexMatch[1]}` };
        }

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

        // 检测相对定位："在刚刚画的圆的左边"
        const relMatch = text.match(/(?:刚刚|最后|刚才)(?:画|绘制|画的|画了)?(?:的|de)?(?:\w*?)(?:的|de)?(左边|右边|上面|下面|左上|右上|左下|右下)/);
        if (relMatch) {
            const relDir = relMatch[1];
            return {
                action: 'draw', shape, color, size,
                region: 'center', // 先画在中间，后面可以通过 arrange 调整
                relativeTo: 'last', // 标记为相对定位
                relativeDir: relDir,
                label: shapeLabel
            };
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
     * 调整颜色
     * @param {string} baseColor - 基础颜色 hex
     * @param {Array} adjustments - 调整参数数组，如 [{type: 'darker'}, {type: 'more_blue'}]
     * @returns {string} 调整后的 hex 颜色
     */
    adjustColor(baseColor, adjustments) {
        let r = parseInt(baseColor.slice(1, 3), 16);
        let g = parseInt(baseColor.slice(3, 5), 16);
        let b = parseInt(baseColor.slice(5, 7), 16);

        for (const adj of adjustments) {
            switch (adj.type) {
                case 'darker':
                    r = Math.max(0, Math.round(r * 0.7));
                    g = Math.max(0, Math.round(g * 0.7));
                    b = Math.max(0, Math.round(b * 0.7));
                    break;
                case 'lighter':
                    r = Math.min(255, Math.round(r + (255 - r) * 0.3));
                    g = Math.min(255, Math.round(g + (255 - g) * 0.3));
                    b = Math.min(255, Math.round(b + (255 - b) * 0.3));
                    break;
                case 'more_red':
                    r = Math.min(255, r + 50);
                    break;
                case 'more_green':
                    g = Math.min(255, g + 50);
                    break;
                case 'more_blue':
                    b = Math.min(255, b + 50);
                    break;
                case 'more_yellow':
                    r = Math.min(255, r + 40);
                    g = Math.min(255, g + 40);
                    break;
            }
        }

        const toHex = (v) => v.toString(16).padStart(2, '0');
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    /**
     * 解析颜色调整命令
     * 匹配模式：「深一点的红色」「更蓝的绿色」「比刚才那个再蓝一点」
     * @param {string} text - 预处理后的文本
     * @param {string} currentColor - 当前使用的颜色 hex（用于相对调整）
     * @returns {Object|null} 颜色命令对象
     */
    parseColorAdjustment(text, currentColor) {
        // 如果文本包含形状关键词，交给 parseDrawCommand 处理
        if (this.findShape(text)) return null;

        let baseColor = null;
        let remaining = '';

        // 模式1：比刚才那个再蓝1点（相对当前颜色）
        const relativeMatch = text.match(/比?(刚才|刚刚|之前)(那个)?再(红|蓝|绿|黄)1?点/);
        if (relativeMatch && currentColor) {
            const channelMap = { '红': 'more_red', '蓝': 'more_blue', '绿': 'more_green', '黄': 'more_yellow' };
            return {
                action: 'color',
                color: this.adjustColor(currentColor, [{ type: channelMap[relativeMatch[3]] }]),
                label: '更' + relativeMatch[3]
            };
        }

        // 模式2：更红/更蓝/更绿/更黄 + 颜色（如"更蓝绿色"）
        const channelAdjMatch = text.match(/更(红|蓝|绿|黄)(.*)/);
        if (channelAdjMatch) {
            const channelMap = { '红': 'more_red', '蓝': 'more_blue', '绿': 'more_green', '黄': 'more_yellow' };
            remaining = channelAdjMatch[2].replace(/1?点|一些/g, '');
            baseColor = this.findColor(remaining);
            if (baseColor) {
                return {
                    action: 'color',
                    color: this.adjustColor(baseColor.color, [{ type: channelMap[channelAdjMatch[1]] }]),
                    label: '更' + channelAdjMatch[1] + baseColor.label
                };
            }
        }

        // 模式3：更深/更暗/更浅/更亮 + 颜色（如"更深红色"）
        const brightAdjMatch = text.match(/更(深|暗|浅|亮)(.*)/);
        if (brightAdjMatch) {
            const type = (brightAdjMatch[1] === '深' || brightAdjMatch[1] === '暗') ? 'darker' : 'lighter';
            remaining = brightAdjMatch[2].replace(/1?点|一些/g, '');
            baseColor = this.findColor(remaining);
            if (baseColor) {
                return {
                    action: 'color',
                    color: this.adjustColor(baseColor.color, [{ type }]),
                    label: brightAdjMatch[1] + baseColor.label
                };
            }
        }

        // 模式4：深/暗 + 1点 + 颜色（如"深1点红色"）
        const darkMatch = text.match(/(深|暗)1?点(.*)/);
        if (darkMatch) {
            remaining = darkMatch[2].replace(/一些/g, '');
            baseColor = this.findColor(remaining);
            if (baseColor) {
                return {
                    action: 'color',
                    color: this.adjustColor(baseColor.color, [{ type: 'darker' }]),
                    label: darkMatch[1] + baseColor.label
                };
            }
        }

        // 模式5：浅/亮 + 1点 + 颜色（如"浅1点紫色"）
        const lightMatch = text.match(/(浅|亮)1?点(.*)/);
        if (lightMatch) {
            remaining = lightMatch[2].replace(/一些/g, '');
            baseColor = this.findColor(remaining);
            if (baseColor) {
                return {
                    action: 'color',
                    color: this.adjustColor(baseColor.color, [{ type: 'lighter' }]),
                    label: lightMatch[1] + baseColor.label
                };
            }
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
                if (cmd.label) return `切换为${cmd.label}`;
                const c = this.colorEntries.find(([k, v]) => v === cmd.color);
                return `切换为${c ? c[0] : '新颜色'}`;
            }
            case 'size':
                if (cmd.value === 'bigger') return '变大';
                if (cmd.value === 'smaller') return '变小';
                return `大小${cmd.value}`;
            case 'scene': return `绘制${cmd.label}场景`;
            case 'pattern': return `绘制${cmd.label}`;
            case 'start_draw': return '开始自由绘画';
            case 'stop_draw': return '停止自由绘画';
            case 'help': return '帮助';
            case 'move': return `向${cmd.label}移动`;
            case 'move_sequence': return `连续移动${cmd.directions.length}个方向`;
            case 'arrange': {
                const modeLabels = {
                    grid: '整齐排列', center: '居中',
                    align_left: '左对齐', align_right: '右对齐',
                    align_top: '顶部对齐', align_bottom: '底部对齐',
                    distribute_h: '水平分布', distribute_v: '垂直分布',
                };
                return modeLabels[cmd.mode] || '排列';
            }
            case 'viewport': {
                if (cmd.mode === 'zoom_in') return '放大画布';
                if (cmd.mode === 'zoom_out') return '缩小画布';
                if (cmd.mode === 'reset') return '重置视图';
                if (cmd.mode === 'pan') {
                    const rn = this.regionEntries.find(([k, v]) => v === cmd.region);
                    return `查看${rn ? rn[0] : cmd.region}`;
                }
                return '视口操作';
            }
            case 'pen_type': return `切换为${cmd.label}笔`;
            case 'connect': return '连接形状';
            case 'background': return `设置${cmd.label}背景`;
            case 'copy': return '复制形状';
            case 'tutorial': return cmd.mode === 'start' ? '开始教程' : cmd.mode === 'exit' ? '退出教程' : '下一步';
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
