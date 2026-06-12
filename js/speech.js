/**
 * 纯语音控制绘图工具 - 语音模块
 *
 * 包含：
 * 1. SpeechRecognitionModule - 语音识别（自动重启、错误恢复）
 * 2. VoiceCommandParser - 自然语言命令解析（正则提取、模糊匹配、组合拆解）
 * 3. SpeechSynthesisModule - TTS 语音反馈
 * 4. CommandHistory - 命令历史记录
 */

// ============================================================
// 1. 语音识别模块
// ============================================================
class SpeechRecognitionModule {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.shouldBeListening = false; // 用于自动重启
        this.onResult = null;
        this.onStart = null;
        this.onEnd = null;
        this.onError = null;
        this.onInterim = null;
        this.restartTimer = null;

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
                this.onResult(finalTranscript.trim());
            }
        };

        this.recognition.onerror = (event) => {
            console.warn('语音识别错误:', event.error);
            // 'no-speech' 和 'aborted' 不算严重错误，自动重启
            if (event.error === 'no-speech' || event.error === 'aborted') {
                this.tryRestart();
                return;
            }
            if (this.onError) this.onError(event.error);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.onEnd) this.onEnd();
            // 如果应该持续监听，自动重启
            if (this.shouldBeListening) {
                this.tryRestart();
            }
        };
    }

    tryRestart() {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
            if (this.shouldBeListening && !this.isListening) {
                try {
                    this.recognition.start();
                } catch (e) {
                    console.warn('重启语音识别失败:', e);
                }
            }
        }, 300);
    }

    start() {
        if (!this.recognition) return false;
        this.shouldBeListening = true;
        try {
            this.recognition.start();
            return true;
        } catch (e) {
            // 可能已经在运行
            console.warn('启动语音识别失败:', e);
            return false;
        }
    }

    stop() {
        this.shouldBeListening = false;
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
// 2. TTS 语音反馈模块
// ============================================================
class SpeechSynthesisModule {
    constructor() {
        this.enabled = true;
        this.queue = [];
        this.speaking = false;
        this.rate = 1.0;
        this.pitch = 1.0;
        this.volume = 1.0;

        // 尝试选择中文语音
        this.voice = null;
        this.loadVoice();
    }

    loadVoice() {
        const loadVoices = () => {
            const voices = speechSynthesis.getVoices();
            // 优先选择中文语音
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
            // 高优先级：取消当前播放
            speechSynthesis.cancel();
            this.queue = [];
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = this.rate;
        utterance.pitch = this.pitch;
        utterance.volume = this.volume;
        if (this.voice) utterance.voice = this.voice;

        utterance.onend = () => {
            this.speaking = false;
            this.processQueue();
        };

        utterance.onerror = () => {
            this.speaking = false;
            this.processQueue();
        };

        if (this.speaking) {
            this.queue.push(utterance);
        } else {
            this.speaking = true;
            speechSynthesis.speak(utterance);
        }
    }

    processQueue() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            this.speaking = true;
            speechSynthesis.speak(next);
        }
    }

    cancel() {
        speechSynthesis.cancel();
        this.queue = [];
        this.speaking = false;
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) this.cancel();
        return this.enabled;
    }
}


// ============================================================
// 3. 自然语言命令解析器
// ============================================================
class VoiceCommandParser {
    constructor() {
        // ========== 图形类型映射 ==========
        this.shapeMap = {
            '圆': 'circle', '圆形': 'circle', '圆圈': 'circle', '圆球': 'circle',
            '正圆': 'circle', '椭圆': 'ellipse',
            '矩形': 'rect', '方形': 'rect', '正方形': 'rect', '长方形': 'rect',
            '长方': 'rect', '方块': 'rect', '方': 'rect',
            '线': 'line', '直线': 'line', '线条': 'line', '画线': 'line',
            '横线': 'hline', '竖线': 'vline', '水平线': 'hline', '垂直线': 'vline',
            '三角': 'triangle', '三角形': 'triangle',
            '星': 'star', '星形': 'star', '五角星': 'star',
            '箭头': 'arrow', '箭': 'arrow',
            '心': 'heart', '心形': 'heart', '爱心': 'heart',
        };

        // ========== 颜色映射 ==========
        this.colorMap = {
            '红色': '#FF0000', '红': '#FF0000', '大红': '#FF0000',
            '深红': '#8B0000', '暗红': '#8B0000',
            '绿色': '#00AA00', '绿': '#00AA00', '草绿': '#7CFC00',
            '深绿': '#006400', '浅绿': '#90EE90',
            '蓝色': '#0000FF', '蓝': '#0000FF', '天蓝': '#87CEEB',
            '深蓝': '#00008B', '浅蓝': '#ADD8E6',
            '黄色': '#FFD700', '黄': '#FFD700',
            '黑色': '#000000', '黑': '#000000',
            '白色': '#FFFFFF', '白': '#FFFFFF',
            '紫色': '#800080', '紫': '#800080', '粉紫': '#DA70D6',
            '粉色': '#FF69B4', '粉': '#FF69B4', '粉红': '#FF69B4',
            '橙色': '#FFA500', '橙': '#FFA500',
            '灰色': '#808080', '灰': '#808080', '浅灰': '#C0C0C0', '深灰': '#404040',
            '棕色': '#8B4513', '棕': '#8B4513', '褐色': '#8B4513',
            '金色': '#FFD700', '银色': '#C0C0C0',
            '青色': '#00FFFF', '青': '#00FFFF',
            '棕色': '#A05223', '咖啡色': '#6F4E37',
        };

        // ========== 区域映射（9宫格） ==========
        this.regionMap = {
            '左上': 'top-left', '左上角': 'top-left', '上面左边': 'top-left', '左上方': 'top-left',
            '上': 'top', '上面': 'top', '顶部': 'top', '上方': 'top', '顶端': 'top',
            '右上': 'top-right', '右上角': 'top-right', '上面右边': 'top-right', '右上方': 'top-right',
            '左': 'left', '左边': 'left', '左侧': 'left', '左面': 'left',
            '中间': 'center', '中心': 'center', '正中间': 'center', '中央': 'center',
            '中间偏左': 'center-left', '中间偏右': 'center-right',
            '右': 'right', '右边': 'right', '右侧': 'right', '右面': 'right',
            '左下': 'bottom-left', '左下角': 'bottom-left', '下面左边': 'bottom-left', '左下方': 'bottom-left',
            '下': 'bottom', '下面': 'bottom', '底部': 'bottom', '下方': 'bottom', '底端': 'bottom',
            '右下': 'bottom-right', '右下角': 'bottom-right', '下面右边': 'bottom-right', '右下方': 'bottom-right',
        };

        // ========== 大小映射 ==========
        this.sizeMap = {
            '很小': 10, '特小': 10, '极小': 10,
            '小': 20, '小的': 20, '小一点': null, '小一些': null,
            '中': 40, '中等': 40, '适中': 40, '不大不小': 40,
            '大': 60, '大的': 60, '大一点': null, '大一些': null,
            '很大': 80, '特大': 80, '超大': 80,
            '最大': 100, '最大的': 100,
            '最小': 10, '最小的': 10,
        };

        // ========== 操作动词 ==========
        this.actionVerbs = {
            '画': 'draw', '画一个': 'draw', '画个': 'draw', '画出': 'draw',
            '绘制': 'draw', '画上': 'draw', '来一个': 'draw', '来个': 'draw',
            '写': 'text', '写上': 'text', '标注': 'text', '写个': 'text',
            '开始画': 'start_draw', '开始绘画': 'start_draw', '自由画': 'start_draw',
            '停止画': 'stop_draw', '停': 'stop_draw', '暂停': 'stop_draw', '不画了': 'stop_draw',
            '撤销': 'undo', '后退': 'undo', '返回上一步': 'undo',
            '重做': 'redo', '前进': 'redo',
            '清除': 'clear', '清空': 'clear', '清除画布': 'clear', '清屏': 'clear',
            '保存': 'save', '保存图片': 'save', '导出': 'save',
            '帮助': 'help', '你会什么': 'help', '怎么用': 'help', '你能做什么': 'help',
            '红色': 'color', '蓝色': 'color', '绿色': 'color', // 会被颜色逻辑捕获
        };

        // ========== 方向映射 ==========
        this.directionMap = {
            '上': { dx: 0, dy: -1 }, '往上': { dx: 0, dy: -1 }, '向上': { dx: 0, dy: -1 },
            '下': { dx: 0, dy: 1 }, '往下': { dx: 0, dy: 1 }, '向下': { dx: 0, dy: 1 },
            '左': { dx: -1, dy: 0 }, '往左': { dx: -1, dy: 0 }, '向左': { dx: -1, dy: 0 },
            '右': { dx: 1, dy: 0 }, '往右': { dx: 1, dy: 0 }, '向右': { dx: 1, dy: 0 },
            '左上': { dx: -1, dy: -1 }, '右上': { dx: 1, dy: -1 },
            '左下': { dx: -1, dy: 1 }, '右下': { dx: 1, dy: 1 },
        };

        // ========== 同义词/模糊匹配 ==========
        this.synonyms = {
            '蛋': '圆', '球': '圆', '饼': '圆', '盘子': '圆',
            '盒子': '方', '窗户': '方', '门': '矩形',
            '道': '线', '杠': '线', '横杠': '线',
        };
    }

    /**
     * 解析语音文本，返回命令数组
     * @param {string} text - 语音识别文本
     * @returns {Array} 命令数组
     */
    parse(text) {
        if (!text || !text.trim()) return [];

        // 预处理：去空格、标点、统一数字
        text = this.preprocess(text);

        // 尝试拆解复合命令
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
     * 预处理文本
     */
    preprocess(text) {
        // 中文数字转阿拉伯数字
        text = this.chineseToNumber(text);
        // 去除常见标点
        text = text.replace(/[，。！？、；：""''（）\[\]【】,.!?;:'"()\s]/g, '');
        // 同义词替换
        for (const [from, to] of Object.entries(this.synonyms)) {
            text = text.replace(new RegExp(from, 'g'), to);
        }
        return text;
    }

    /**
     * 中文数字转阿拉伯数字
     */
    chineseToNumber(text) {
        const numMap = {
            '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
            '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
            '二十': 20, '三十': 30, '四十': 40, '五十': 50,
        };
        // 先替换复合数字
        for (const [cn, num] of Object.entries(numMap).sort((a, b) => b[0].length - a[0].length)) {
            text = text.replace(new RegExp(cn, 'g'), String(num));
        }
        return text;
    }

    /**
     * 拆解复合命令
     * 如 "画三个红色圆形" → 重复3次 "画红色圆形"
     * 如 "画一个圆和一条线" → ["画一个圆", "画一条线"]
     */
    splitCompound(text) {
        // 检测 "画N个" 模式
        const repeatMatch = text.match(/画(\d+)个(.+)/);
        if (repeatMatch) {
            const count = Math.min(parseInt(repeatMatch[1]), 10); // 最多10个
            const content = repeatMatch[2];
            return Array(count).fill('画一个' + content);
        }

        // 检测 "和"、"然后"、"接着" 连接的多命令
        const parts = text.split(/(?:然后|接着|再|还有|和)/);
        if (parts.length > 1) {
            return parts.map(p => p.trim()).filter(p => p.length > 0);
        }

        return [text];
    }

    /**
     * 解析单个命令段
     */
    parseSegment(text) {
        if (!text) return null;

        // 1. 检查操作命令（撤销、清除、保存等）
        const actionCmd = this.parseAction(text);
        if (actionCmd) return actionCmd;

        // 2. 检查方向命令（自由画模式下的方向控制）
        const dirCmd = this.parseDirection(text);
        if (dirCmd) return dirCmd;

        // 3. 检查大小调整命令
        const sizeAdjCmd = this.parseSizeAdjust(text);
        if (sizeAdjCmd) return sizeAdjCmd;

        // 4. 检查颜色切换命令
        const colorCmd = this.parseColorChange(text);
        if (colorCmd) return colorCmd;

        // 5. 检查绘制命令（最复杂，包含形状+颜色+大小+位置）
        const drawCmd = this.parseDrawCommand(text);
        if (drawCmd) return drawCmd;

        // 6. 检查文字命令
        const textCmd = this.parseTextCommand(text);
        if (textCmd) return textCmd;

        // 7. 都不匹配，返回未知命令
        return { action: 'unknown', raw: text };
    }

    /**
     * 解析操作类命令
     */
    parseAction(text) {
        if (/(?:撤销|后退|返回上一步)/.test(text)) return { action: 'undo' };
        if (/(?:重做|前进)/.test(text)) return { action: 'redo' };
        if (/(?:清除|清空|清屏|清除画布)/.test(text)) return { action: 'clear' };
        if (/(?:保存|保存图片|导出)/.test(text)) return { action: 'save' };
        if (/(?:帮助|怎么用|你能做什么|你会什么)/.test(text)) return { action: 'help' };
        if (/(?:开始画|开始绘画|自由画|画笔模式)/.test(text)) return { action: 'start_draw' };
        if (/(?:停止画|停|暂停|不画了|结束画)/.test(text)) return { action: 'stop_draw' };
        return null;
    }

    /**
     * 解析方向命令（自由画模式下的移动）
     */
    parseDirection(text) {
        for (const [keyword, dir] of Object.entries(this.directionMap)) {
            if (text === keyword || text === '往' + keyword || text === '向' + keyword) {
                return { action: 'move', direction: dir, label: keyword };
            }
        }
        return null;
    }

    /**
     * 解析大小调整命令
     */
    parseSizeAdjust(text) {
        if (/大一点|大一些|粗一点|粗一些/.test(text)) return { action: 'size', value: 'bigger' };
        if (/小一点|小一些|细一点|细一些/.test(text)) return { action: 'size', value: 'smaller' };
        if (/最大/.test(text)) return { action: 'size', value: 100 };
        if (/最小/.test(text)) return { action: 'size', value: 10 };

        // 数字大小： "大小20"、"画笔20"、"粗细20"
        const numMatch = text.match(/(?:大小|画笔|粗细|尺寸|设置)(\d+)/);
        if (numMatch) return { action: 'size', value: parseInt(numMatch[1]) };

        return null;
    }

    /**
     * 解析纯颜色切换命令
     */
    parseColorChange(text) {
        for (const [keyword, color] of Object.entries(this.colorMap)) {
            if (text === keyword || text === '换' + keyword || text === '变成' + keyword) {
                return { action: 'color', color: color, label: keyword };
            }
        }
        return null;
    }

    /**
     * 解析绘制命令
     * 格式：[画][一个][颜色][大小]形状[在位置]
     */
    parseDrawCommand(text) {
        // 提取形状
        let shape = null;
        let shapeLabel = '';
        for (const [keyword, shapeType] of Object.entries(this.shapeMap)) {
            if (text.includes(keyword)) {
                shape = shapeType;
                shapeLabel = keyword;
                break;
            }
        }
        if (!shape) return null;

        // 提取颜色（从整个文本中）
        let color = null;
        let colorLabel = '';
        for (const [keyword, colorValue] of Object.entries(this.colorMap)) {
            if (text.includes(keyword)) {
                color = colorValue;
                colorLabel = keyword;
                break;
            }
        }

        // 提取大小
        let size = null;
        for (const [keyword, sizeValue] of Object.entries(this.sizeMap)) {
            if (text.includes(keyword)) {
                size = sizeValue;
                break;
            }
        }

        // 提取数字大小（如 "大小50"、"直径100"）
        if (size === null) {
            const numMatch = text.match(/(?:大小|直径|半径|宽度|高度|尺寸)(\d+)/);
            if (numMatch) size = parseInt(numMatch[1]);
        }

        // 提取位置
        let region = null;
        for (const [keyword, regionValue] of Object.entries(this.regionMap)) {
            if (text.includes(keyword)) {
                region = regionValue;
                break;
            }
        }

        // 特殊处理：横线和竖线
        if (shape === 'hline') {
            shape = 'line';
            region = region || 'center';
            // 横线默认从左到右
            return {
                action: 'draw',
                shape: 'hline',
                color: color,
                size: size,
                region: region,
                label: `横线`
            };
        }
        if (shape === 'vline') {
            shape = 'line';
            region = region || 'center';
            return {
                action: 'draw',
                shape: 'vline',
                color: color,
                size: size,
                region: region,
                label: `竖线`
            };
        }

        // 检测线的起点和终点（如 "从左上到右下"）
        if (shape === 'line') {
            const lineMatch = text.match(/从(.+?)到(.+)/);
            if (lineMatch) {
                const startRegion = this.findRegion(lineMatch[1]);
                const endRegion = this.findRegion(lineMatch[2]);
                if (startRegion && endRegion) {
                    return {
                        action: 'draw',
                        shape: 'line',
                        color: color,
                        size: size,
                        startRegion: startRegion,
                        endRegion: endRegion,
                        label: `从${lineMatch[1]}到${lineMatch[2]}的线`
                    };
                }
            }
        }

        return {
            action: 'draw',
            shape: shape,
            color: color,
            size: size,
            region: region || 'center', // 默认画在中间
            label: shapeLabel
        };
    }

    /**
     * 从文本中查找区域
     */
    findRegion(text) {
        for (const [keyword, region] of Object.entries(this.regionMap)) {
            if (text.includes(keyword)) return region;
        }
        return null;
    }

    /**
     * 解析文字标注命令
     */
    parseTextCommand(text) {
        // 匹配 "写上XXX在YYY" 或 "标注XXX"
        const match = text.match(/(?:写上|写|标注|写个)(.+?)(?:在(.+))?$/);
        if (match) {
            const content = match[1];
            let region = null;
            if (match[2]) {
                region = this.findRegion(match[2]);
            }
            return {
                action: 'text',
                content: content,
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
            case 'draw':
                const parts = [];
                if (cmd.color) {
                    const colorName = Object.entries(this.colorMap).find(([k, v]) => v === cmd.color);
                    if (colorName) parts.push(colorName[0]);
                }
                if (cmd.size) {
                    const sizeName = Object.entries(this.sizeMap).find(([k, v]) => v === cmd.size);
                    if (sizeName) parts.push(sizeName[0]);
                }
                const shapeName = Object.entries(this.shapeMap).find(([k, v]) => v === cmd.shape);
                parts.push(shapeName ? shapeName[0] : cmd.shape);

                if (cmd.startRegion && cmd.endRegion) {
                    const startName = Object.entries(this.regionMap).find(([k, v]) => v === cmd.startRegion);
                    const endName = Object.entries(this.regionMap).find(([k, v]) => v === cmd.endRegion);
                    return `从${startName ? startName[0] : ''}到${endName ? endName[0] : ''}画一条${parts.join('')}`;
                }

                const regionName = Object.entries(this.regionMap).find(([k, v]) => v === cmd.region);
                return `在${regionName ? regionName[0] : '中间'}画一个${parts.join('')}`;

            case 'text':
                return `在${cmd.region === 'center' ? '中间' : cmd.region}写上${cmd.content}`;

            case 'undo': return '撤销上一步';
            case 'redo': return '重做';
            case 'clear': return '清除画布';
            case 'save': return '保存图片';
            case 'color':
                const cName = Object.entries(this.colorMap).find(([k, v]) => v === cmd.color);
                return `切换为${cName ? cName[0] : '新颜色'}`;
            case 'size':
                if (cmd.value === 'bigger') return '画笔变大';
                if (cmd.value === 'smaller') return '画笔变小';
                return `画笔大小设为${cmd.value}`;
            case 'start_draw': return '开始自由绘画';
            case 'stop_draw': return '停止自由绘画';
            case 'help': return '显示帮助';
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
            command: command,
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
