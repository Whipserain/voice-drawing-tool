/**
 * 命令配置中心
 *
 * 所有映射数据、场景模板、路径模板集中管理。
 * 新增功能只需在此文件添加配置段，无需修改 speech.js 的构造函数。
 *
 * 同时提供命令注册机制，各模块通过 registerCommand/registerParser 注册，
 * 避免多个 agent 并行修改同一个 switch 或 parseSegment。
 */

// ============================================================
// 映射数据
// ============================================================

const COMMAND_CONFIG = {
    // 图形类型映射（按长度降序，优先匹配长词）
    shapeEntries: [
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
        ['蛋', 'circle'], ['球', 'circle'], ['饼', 'circle'], ['盘子', 'circle'],
        ['盒子', 'rect'], ['窗户', 'rect'], ['门', 'rect'],
    ],

    // 颜色映射（按长度降序）
    colorEntries: [
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
    ],

    // 区域映射（按长度降序）
    regionEntries: [
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
    ],

    // 画笔类型映射（按长度降序）
    penTypeEntries: [
        ['油画笔', 'oil'], ['水彩笔', 'watercolor'], ['马克笔', 'marker'],
        ['粉笔', 'chalk'], ['蜡笔', 'crayon'], ['毛笔', 'brush'],
        ['铅笔', 'pencil'], ['钢笔', 'pen'],
    ],

    // 大小映射
    sizeEntries: [
        ['不大不小', 40], ['很小', 10], ['特小', 10], ['极小', 10],
        ['很大', 80], ['特大', 80], ['超大', 80],
        ['最大', 100], ['最小', 10],
        ['小一点', null], ['小一些', null], ['细一点', null], ['细一些', null],
        ['大一点', null], ['大一些', null], ['粗一点', null], ['粗一些', null],
        ['中等', 40], ['适中', 40], ['小的', 20], ['大的', 60],
        ['大', 60], ['小', 20], ['中', 40],
    ],

    // 方向映射
    directionEntries: [
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
    ],

    // 形状路径模板
    shapePathTemplates: [
        {
            keywords: ['Z字形', 'Z形', 'z字形', 'z形'],
            name: 'Z字形',
            directions: [
                { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
                { dx: 0, dy: 1 }, { dx: 1, dy: 0 },
            ],
        },
        {
            keywords: ['方形路径', '画个方形路径'],
            name: '方形',
            directions: [
                { dx: 1, dy: 0 }, { dx: 0, dy: 1 },
                { dx: -1, dy: 0 }, { dx: 0, dy: -1 },
            ],
        },
        {
            keywords: ['三角形路径'],
            name: '三角形路径',
            directions: [
                { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 0, dy: -1 },
            ],
        },
    ],

    // 填充词/语气词
    fillerWords: [
        '帮我', '麻烦', '请', '能不能', '可不可以',
        '我想', '我要', '你帮我', '麻烦你',
        '吧', '啊', '呢', '哦', '嗯', '呀', '哈',
        '了', '的', '得', '地',
        '那么', '然后呢', '就是', '就是说',
    ],
};


// ============================================================
// 场景模板（独立配置段，新增场景只需在此添加）
// ============================================================

const SCENE_TEMPLATES = {
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


// ============================================================
// 命令注册机制（表驱动，避免并行修改同一个 switch）
// ============================================================

const CommandRegistry = {
    // action 名 → handler 函数映射
    handlers: {},

    /**
     * 注册命令处理器
     * @param {string} action - 命令 action 名
     * @param {function} handler - 处理函数 (app, cmd) => void
     */
    register(action, handler) {
        this.handlers[action] = handler;
    },

    /**
     * 执行命令
     * @param {object} app - App 实例
     * @param {object} cmd - 命令对象
     */
    execute(app, cmd) {
        if (!cmd) return;
        const handler = this.handlers[cmd.action];
        if (handler) {
            handler(app, cmd);
        } else if (cmd.action === 'unknown') {
            app.showFeedback(`未理解: "${cmd.raw}"`, 'error');
            app.tts.speak('没听懂，请参考帮助。');
        }
    },
};


// ============================================================
// 解析器注册机制（链式，避免并行修改同一个 parseSegment）
// ============================================================

const ParserRegistry = {
    // 解析器列表，按优先级排序
    parsers: [],

    /**
     * 注册解析器
     * @param {string} name - 解析器名称
     * @param {function} parserFn - 解析函数 (parser, text, currentColor) => cmd | null
     * @param {number} priority - 优先级（越小越先执行）
     */
    register(name, parserFn, priority = 50) {
        this.parsers.push({ name, parserFn, priority });
        this.parsers.sort((a, b) => a.priority - b.priority);
    },

    /**
     * 执行解析链
     * @param {object} parser - VoiceCommandParser 实例
     * @param {string} text - 预处理后的文本
     * @param {string} currentColor - 当前颜色
     * @returns {object|null} 命令对象
     */
    parse(parser, text, currentColor) {
        for (const { parserFn } of this.parsers) {
            const result = parserFn(parser, text, currentColor);
            if (result) return result;
        }
        return { action: 'unknown', raw: text };
    },
};


// ============================================================
// 导出
// ============================================================
window.COMMAND_CONFIG = COMMAND_CONFIG;
window.SCENE_TEMPLATES = SCENE_TEMPLATES;
window.CommandRegistry = CommandRegistry;
window.ParserRegistry = ParserRegistry;
