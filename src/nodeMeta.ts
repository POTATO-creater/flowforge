import type { NodeKind, NodeMeta, FlowNodeData } from './types';
import { nanoid } from 'nanoid';

/**
 * 11 类节点的元信息。
 * 【写作规范】name / desc / plain 一律用大白话，不出现技术术语。
 */
export const NODE_METAS: Record<NodeKind, NodeMeta> = {
  start: {
    kind: 'start',
    name: '开始',
    desc: '填一句话作为输入',
    plain: '这里是工作流的起点。写一句话作为任务的开头，后面的节点都能用它。',
    badge: '起',
    colorVar: '--nt-start',
    group: 'input',
    defaultConfig: () => ({ text: '请介绍一下人工智能的发展历程。' }),
  },

  llm: {
    kind: 'llm',
    name: '让 AI 干活',
    desc: '让 AI 帮你写内容',
    plain: '把任务交给 AI。写清楚「让它做什么」，其他都不用管，直接就能跑。',
    badge: 'AI',
    colorVar: '--nt-llm',
    group: 'ai',
    defaultConfig: () => ({
      model: '',
      system: '你是一个乐于助人的助手。',
      prompt: '',
      temperature: 0.7,
      maxTokens: 1024,
    }),
  },

  chain: {
    kind: 'chain',
    name: '想清楚再答',
    desc: '先推理，再给答案',
    plain: '让 AI 先想清楚再回答，答案通常更靠谱。适合需要算一算、推一推的问题。',
    badge: '想',
    colorVar: '--nt-chain',
    group: 'ai',
    defaultConfig: () => ({
      model: '',
      question: '',
      steps: 3,
      guide: '请一步一步思考，每一步以「步骤1:」「步骤2:」开头，最后用「最终答案:」给出结论。',
    }),
  },

  agent: {
    kind: 'agent',
    name: '带工具问答',
    desc: '让 AI 自己去查资料',
    plain: '给 AI 配几样「工具」，它会自己判断什么时候该用，再用查到的结果回答你。',
    badge: '查',
    colorVar: '--nt-agent',
    group: 'ai',
    defaultConfig: () => ({
      model: '',
      system: '你可以调用提供的工具来获取信息，然后据此回答用户。',
      prompt: '',
      maxRounds: 3,
      tools: JSON.stringify(
        [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: '查询指定城市的当前天气',
              parameters: {
                type: 'object',
                properties: {
                  city: { type: 'string', description: '城市名，如 北京' },
                },
                required: ['city'],
              },
            },
          },
        ],
        null,
        2,
      ),
    }),
  },

  tool: {
    kind: 'tool',
    name: '访问网址',
    desc: '去一个网址取数据',
    plain: '直接去访问一个网址，把拿回来的内容交给后面的节点用。',
    badge: '网',
    colorVar: '--nt-tool',
    group: 'net',
    needsProxy: true,
    defaultConfig: () => ({
      method: 'GET',
      url: 'https://api.github.com/repos/facebook/react',
      headers: '',
      body: '',
    }),
  },

  fetch: {
    kind: 'fetch',
    name: '读网页',
    desc: '把网页变成纯文字',
    plain: '把一个网页的内容抓下来，变成干净的纯文字，这样 AI 就能读懂了。',
    badge: '读',
    colorVar: '--nt-fetch',
    group: 'net',
    needsProxy: true,
    defaultConfig: () => ({
      url: '',
      extract: 'markdown' as const,
      proxy: 'https://r.jina.ai/',
      headers: '',
      timeout: 30,
    }),
  },

  condition: {
    kind: 'condition',
    name: '如果……就……',
    desc: '分岔走不同的路',
    plain: '做一个「如果……那就……」的判断，让工作流岔到不同的路上去。',
    badge: '岔',
    colorVar: '--nt-condition',
    group: 'flow',
    defaultConfig: () => ({ expression: '' }),
  },

  merge: {
    kind: 'merge',
    name: '汇总',
    desc: '把几条线合成一份',
    plain: '把前面几条线汇到一起，合成一份内容，再继续往下走。',
    badge: '合',
    colorVar: '--nt-merge',
    group: 'flow',
    defaultConfig: () => ({
      mode: 'concat' as const,
      separator: '\n\n---\n\n',
      template: '',
    }),
  },

  loop: {
    kind: 'loop',
    name: '分段处理',
    desc: '一段一段重复做',
    plain: '把一大段内容切成几小段，让 AI 每一小段都处理一遍，比如逐段做总结。',
    badge: '段',
    colorVar: '--nt-loop',
    group: 'flow',
    defaultConfig: () => ({
      model: '',
      source: '',
      separator: '\n---\n',
      system: '你是一个乐于助人的助手。',
      itemPrompt: '请用一句话总结下面这段内容：\n\n{{item}}',
      maxItems: 10,
    }),
  },

  code: {
    kind: 'code',
    name: '程序加工',
    desc: '用代码处理文字',
    plain: '用一小段程序来加工文字，比如截取、替换、拼装。不熟悉可以跳过这个节点。',
    badge: '码',
    colorVar: '--nt-code',
    group: 'flow',
    defaultConfig: () => ({ expression: 'return (input || "").toUpperCase();' }),
  },

  output: {
    kind: 'output',
    name: '看结果',
    desc: '最后展示出来',
    plain: '整个工作流的终点，最终结果会在这里显示出来。',
    badge: '果',
    colorVar: '--nt-output',
    group: 'output',
    defaultConfig: () => ({ template: '' }),
  },

  // ============================================================
  // 数据整理（纯函数，不联网，最稳）
  // ============================================================

  pick: {
    kind: 'pick',
    name: '挑出想要的',
    desc: '只留下需要的几项',
    plain: '前面给过来的东西可能有好几项，这里只留下你真正要用的那几项。',
    badge: '挑',
    colorVar: '--nt-pick',
    group: 'data',
    defaultConfig: () => ({ fields: '', missing: 'skip' as const }),
  },

  filter: {
    kind: 'filter',
    name: '分拣',
    desc: '按关键词筛一筛',
    plain: '把一堆内容按关键词筛一遍，只要符合条件的，其余的丢掉。',
    badge: '筛',
    colorVar: '--nt-filter',
    group: 'data',
    defaultConfig: () => ({ keyword: '', mode: 'contains' as const }),
  },

  sort: {
    kind: 'sort',
    name: '排序',
    desc: '按大小、长短排队',
    plain: '把一堆内容按顺序排好。可以按文字先后、按长短、或按数字大小。',
    badge: '排',
    colorVar: '--nt-sort',
    group: 'data',
    defaultConfig: () => ({ by: 'text' as const, order: 'asc' as const }),
  },

  limit: {
    kind: 'limit',
    name: '只要前几条',
    desc: '只留下头几条',
    plain: '内容太多的时候，只留下前面几条（或者最后几条），后面的不要了。',
    badge: '截',
    colorVar: '--nt-limit',
    group: 'data',
    defaultConfig: () => ({ count: 5, from: 'head' as const }),
  },

  dedupe: {
    kind: 'dedupe',
    name: '去掉重复',
    desc: '重复的只留一条',
    plain: '一堆内容里如果有重复的，只保留一条，其余的删掉。',
    badge: '去',
    colorVar: '--nt-dedupe',
    group: 'data',
    defaultConfig: () => ({ ignoreCase: false }),
  },

  splitout: {
    kind: 'splitout',
    name: '分成多条',
    desc: '一大段切成好几条',
    plain: '把一大段内容按某个记号切开，变成一条一条的，方便后面逐条处理。',
    badge: '切',
    colorVar: '--nt-splitout',
    group: 'data',
    defaultConfig: () => ({ separator: '\n' }),
  },

  aggregate: {
    kind: 'aggregate',
    name: '聚成一组',
    desc: '好几条合成一组',
    plain: '把好几条内容合到一起当成一组，交给后面的节点一起处理。',
    badge: '聚',
    colorVar: '--nt-aggregate',
    group: 'data',
    defaultConfig: () => ({ separator: '\n' }),
  },

  summarize: {
    kind: 'summarize',
    name: '算一算',
    desc: '数一数、加一加',
    plain: '对一堆数字做点计算：数个数、求和、算平均、找最大最小。',
    badge: '算',
    colorVar: '--nt-summarize',
    group: 'data',
    defaultConfig: () => ({ op: 'count' as const, separator: '\n' }),
  },

  renamekeys: {
    kind: 'renamekeys',
    name: '改字段名',
    desc: '把项目名字改一改',
    plain: '把内容里各项的名字换成你想要的名字，方便后面统一引用。',
    badge: '改',
    colorVar: '--nt-renamekeys',
    group: 'data',
    defaultConfig: () => ({ mapping: '' }),
  },

  // ============================================================
  // 文字处理
  // ============================================================

  markdown: {
    kind: 'markdown',
    name: '转换排版',
    desc: '在两种排版之间转换',
    plain: '把「带记号写的文字」和「网页排版的文字」互相转一下，两种写法都能用。',
    badge: '排',
    colorVar: '--nt-markdown',
    group: 'text',
    defaultConfig: () => ({ text: '', direction: 'md2html' as const }),
  },

  html: {
    kind: 'html',
    name: '摆弄网页标签',
    desc: '从网页里挑内容',
    plain: '网页那段代码里挑出你要的部分，比如所有标题、所有链接。',
    badge: '标',
    colorVar: '--nt-html',
    group: 'text',
    defaultConfig: () => ({ text: '', op: 'toText' as const, selector: '', attr: '' }),
  },

  xml: {
    kind: 'xml',
    name: '处理数据格式',
    desc: '两种数据写法互转',
    plain: '有些接口给的是「尖括号那套写法」，这里把它转成能直接读的样子，或者反过来。',
    badge: '格',
    colorVar: '--nt-xml',
    group: 'text',
    defaultConfig: () => ({ text: '', direction: 'xml2obj' as const }),
  },

  findreplace: {
    kind: 'findreplace',
    name: '查找替换',
    desc: '把某些字换掉',
    plain: '在文字里找出某个内容，换成别的。适合批量改名、清理多余符号。',
    badge: '替',
    colorVar: '--nt-findreplace',
    group: 'text',
    defaultConfig: () => ({
      text: '',
      find: '',
      replace: '',
      regex: false,
      all: true,
      ignoreCase: false,
    }),
  },

  slice: {
    kind: 'slice',
    name: '切一段出来',
    desc: '只取其中一段',
    plain: '从一段文字里截取其中一部分：按第几段来取，或者按第几个字到第几个字取。',
    badge: '取',
    colorVar: '--nt-slice',
    group: 'text',
    defaultConfig: () => ({
      text: '',
      bySeparator: true,
      separator: '\n',
      index: 0,
      from: 0,
      to: 0,
    }),
  },

  // ============================================================
  // 日期与编码
  // ============================================================

  datetime: {
    kind: 'datetime',
    name: '日期时间',
    desc: '算日子、换写法',
    plain: '拿当前时间、把日期换成别的写法、往后推几天、算两个日子差多少天。',
    badge: '日',
    colorVar: '--nt-datetime',
    group: 'codec',
    defaultConfig: () => ({
      source: '',
      op: 'now' as const,
      format: 'YYYY-MM-DD HH:mm:ss',
      amount: 1,
      unit: 'day' as const,
      target: '',
    }),
  },

  crypto: {
    kind: 'crypto',
    name: '加密哈希',
    desc: '生成指纹或随机串',
    plain: '给内容算一个「指纹」（内容变一点指纹就完全不同），或者生成一串随机字符。',
    badge: '密',
    colorVar: '--nt-crypto',
    group: 'codec',
    defaultConfig: () => ({
      text: '',
      op: 'hash' as const,
      algorithm: 'SHA-256' as const,
      secret: '',
      length: 16,
      randomKind: 'alnum' as const,
    }),
  },

  encode: {
    kind: 'encode',
    name: '编码转换',
    desc: '换一种存放写法',
    plain: '把文字换一种存放方式，或者把换过的写法还原回来。常见于处理网址和乱码。',
    badge: '编',
    colorVar: '--nt-encode',
    group: 'codec',
    defaultConfig: () => ({ text: '', op: 'b64enc' as const }),
  },

  totp: {
    kind: 'totp',
    name: '生成动态口令',
    desc: '每 30 秒一变的口令',
    plain: '按密钥生成一个几十秒就换一次的口令，和手机上的验证器是同一套算法。',
    badge: '令',
    colorVar: '--nt-totp',
    group: 'codec',
    defaultConfig: () => ({
      secret: '',
      digits: 6,
      period: 30,
      algorithm: 'SHA-1' as const,
    }),
  },

  jwt: {
    kind: 'jwt',
    name: '看令牌',
    desc: '解读或生成登录凭证',
    plain: '把一串登录凭证解开看里面写了什么，或者按内容生成一串。',
    badge: '牌',
    colorVar: '--nt-jwt',
    group: 'codec',
    defaultConfig: () => ({ token: '', op: 'decode' as const, secret: '', payload: '{}' }),
  },

  // ============================================================
  // 网络类（实测确认支持跨域，不需要密钥）
  // ============================================================

  hn: {
    kind: 'hn',
    name: '看技术热榜',
    desc: '拿技术圈的热门话题',
    plain: '把技术圈正在热议的话题榜单拿下来，可以接着让 AI 帮你总结。',
    badge: '榜',
    colorVar: '--nt-hn',
    group: 'net',
    defaultConfig: () => ({ source: 'hn-top', count: 10 }),
  },

  rss: {
    kind: 'rss',
    name: '读订阅',
    desc: '拿一个订阅源的文章',
    plain: '把一个订阅地址（那种给阅读器用的）里的最新文章标题和链接拿下来。',
    badge: '订',
    colorVar: '--nt-rss',
    group: 'net',
    needsProxy: true,
    defaultConfig: () => ({ url: '', count: 10 }),
  },

  chart: {
    kind: 'chart',
    name: '出图表',
    desc: '把数字画成图',
    plain: '把一串数字画成柱状图、折线图或饼图，生成一张图片地址，可以直接展示。',
    badge: '图',
    colorVar: '--nt-chart',
    group: 'net',
    defaultConfig: () => ({
      chartType: 'bar' as const,
      labels: '一月, 二月, 三月',
      values: '10, 20, 15',
      title: '',
    }),
  },

  fact: {
    kind: 'fact',
    name: '查冷知识',
    desc: '随机来一条冷知识',
    plain: '随机拿一条冷知识或猫的小知识，用来测试流程、或者当内容素材。',
    badge: '冷',
    colorVar: '--nt-fact',
    group: 'net',
    defaultConfig: () => ({ source: 'uselessfacts' }),
  },

  // ============================================================
  // 流程控制补充
  // ============================================================

  wait: {
    kind: 'wait',
    name: '等一会儿',
    desc: '停几秒再往下走',
    plain: '先等几秒再继续。用在需要给对端一点缓冲、或者不想请求太快的时候。',
    badge: '等',
    colorVar: '--nt-wait',
    group: 'flow',
    defaultConfig: () => ({ seconds: 3 }),
  },

  switch: {
    kind: 'switch',
    name: '分多条路',
    desc: '按关键词走不同的路',
    plain: '看前面的内容里出现了哪个关键词，就让它走对应的那条路。可以有好多条路。',
    badge: '路',
    colorVar: '--nt-switch',
    group: 'flow',
    defaultConfig: () => ({
      routes: '新闻=走新闻那条\n教程=走教程那条',
      fallback: 'yes',
    }),
  },

  stop: {
    kind: 'stop',
    name: '出错就停',
    desc: '主动中断流程',
    plain: '到这里主动停下来并提示一句话。用来挡住不合格的内容，不让它继续往下走。',
    badge: '停',
    colorVar: '--nt-stop',
    group: 'flow',
    defaultConfig: () => ({ message: '内容不符合要求，先停一下。', when: 'always' as const }),
  },

  watch: {
    kind: 'watch',
    name: '显示面板',
    desc: '连到哪儿就看哪儿',
    plain:
      '把它接到任意一个节点上，它就会把那个节点跑出来的某一项直接显示在卡片上。用来盯住流程中间的某个数，不用一路看到最后。',
    badge: '显',
    colorVar: '--nt-watch',
    group: 'output',
    defaultConfig: () => ({ want: '', note: '' }),
  },
};

/** 侧栏分区的展示顺序与标题（按功能分组） */
export const NODE_GROUPS: { key: NodeMeta['group']; title: string }[] = [
  { key: 'input', title: '从哪开始' },
  { key: 'ai', title: '让 AI 干活' },
  { key: 'net', title: '去网上取东西' },
  { key: 'data', title: '数据整理' },
  { key: 'text', title: '文字处理' },
  { key: 'codec', title: '日期与编码' },
  { key: 'flow', title: '控制流程' },
  { key: 'output', title: '看结果' },
];

export const NODE_LIST: NodeMeta[] = Object.values(NODE_METAS);

/** 创建一个带有默认配置的新节点 */
export function makeNode(
  kind: NodeKind,
  position: { x: number; y: number },
): { id: string; type: 'flow'; position: { x: number; y: number }; data: FlowNodeData } {
  const meta = NODE_METAS[kind];
  return {
    id: `${kind}_${nanoid(6)}`,
    type: 'flow',
    position,
    data: {
      kind,
      label: meta.name,
      config: meta.defaultConfig(),
    },
  };
}
