// ============================================================
// 各节点的字段描述：驱动 Inspector 通用渲染 + 简单点/全都要模式分级
//
// 【写作规范】所有 label / hint / placeholder 必须是大白话。
// 禁止出现：token、JSON、System Prompt、API、表达式、插值、
//          HTML、Markdown、布尔、变量名等技术词。
// 变量一律使用中文：{{节点名.结果名}}
// ============================================================
import type { NodeKind, NodeFieldSpec, FieldDef } from './types';

/**
 * 该节点产出对外暴露的「结果名」——这是给用户看的中文名，
 * 界面上写 {{节点名.结果名}} 时用的就是它。
 */
export const VAR_FIELD: Record<NodeKind, string> = {
  start: '内容',
  llm: '结果',
  chain: '答案',
  agent: '回答',
  tool: '返回',
  fetch: '正文',
  condition: '判断',
  merge: '汇总',
  loop: '结果',
  code: '结果',
  output: '内容',
  pick: '结果',
  filter: '结果',
  sort: '结果',
  limit: '结果',
  dedupe: '结果',
  splitout: '结果',
  aggregate: '结果',
  summarize: '结果',
  renamekeys: '结果',
  markdown: '结果',
  html: '结果',
  xml: '结果',
  findreplace: '结果',
  slice: '结果',
  datetime: '结果',
  crypto: '结果',
  encode: '结果',
  totp: '口令',
  jwt: '结果',
  hn: '榜单',
  rss: '文章',
  chart: '图片',
  fact: '内容',
  wait: '内容',
  switch: '判断',
  stop: '内容',
};

/**
 * 引擎内部真实使用的字段名。
 * 【不要与 VAR_FIELD 混用】VAR_FIELD 是给人看的外号，
 * 这里才是 output 对象上真实存在的键，变量解析必须落到这里。
 */
export const RAW_VAR_FIELD: Record<NodeKind, string> = {
  start: 'text',
  llm: 'content',
  chain: 'content',
  agent: 'content',
  tool: 'body',
  fetch: 'content',
  condition: 'branch',
  merge: 'text',
  loop: 'text',
  code: 'result',
  output: 'text',
  pick: 'result',
  filter: 'result',
  sort: 'result',
  limit: 'result',
  dedupe: 'result',
  splitout: 'result',
  aggregate: 'result',
  summarize: 'result',
  renamekeys: 'result',
  markdown: 'result',
  html: 'result',
  xml: 'result',
  findreplace: 'result',
  slice: 'result',
  datetime: 'result',
  crypto: 'result',
  encode: 'result',
  totp: 'code',
  jwt: 'result',
  hn: 'list',
  rss: 'list',
  chart: 'url',
  fact: 'text',
  wait: 'text',
  switch: 'branch',
  stop: 'text',
};

/** 节点内可用于「套用一个技能」的字段（含长期要求的节点） */
export const SKILL_TARGETS: Partial<Record<NodeKind, string>> = {
  llm: 'system',
  chain: 'guide',
  agent: 'system',
  loop: 'system',
};

const MODEL_FIELD: FieldDef = {
  key: 'model',
  label: '用哪个 AI',
  type: 'text',
  level: 'basic',
  placeholder: '不用填，默认用设置里的那个',
  hint: '留空就行，除非你想换个 AI 试试',
  vars: false,
};

/** 回答风格：用滑块代替「发散程度」，两端是人话 */
const TEMPERATURE_FIELD: FieldDef = {
  key: 'temperature',
  label: '回答风格',
  type: 'slider',
  level: 'basic',
  min: 0,
  max: 1,
  step: 0.1,
  ends: ['老老实实的', '天马行空的'],
  hint: '偏左更稳更准，偏右更活更放得开',
  vars: false,
};

const MAX_TOKENS_FIELD: FieldDef = {
  key: 'maxTokens',
  label: '回复最长多少字',
  type: 'number',
  level: 'advanced',
  min: 100,
  step: 100,
  hint: '大概的字数，不够长就往大调',
  vars: false,
};

/**
 * 字段描述表：新增节点只需在此登记，Inspector 自动渲染。
 *
 * 这里先登记「原有节点」，数据整理 / 文字处理 / 日期与编码三类
 * 在文件末尾通过 BASE_FIELDS 合并进来（见下方 newFields）。
 */
const BASE_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  start: {
    plain: '这里是整个工作流的起点。写一句话作为任务的开头，后面的节点都能用它。',
    resultName: '内容',
    fields: [
      {
        key: 'text',
        label: '要说的话',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '例如：请介绍一下人工智能的发展历程。',
        hint: '写清楚你想让 AI 干什么',
      },
    ],
  },

  llm: {
    plain: '把任务交给 AI。写清楚「让它做什么」，其他都不用管，直接就能跑。',
    skillTarget: true,
    skillField: 'system',
    resultName: '结果',
    fields: [
      {
        key: 'prompt',
        label: '让 AI 做什么',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '例如：把下面这段内容总结成三句话。',
        hint: '用下面的按钮可以把别的节点结果放进来',
      },
      MODEL_FIELD,
      TEMPERATURE_FIELD,
      {
        key: 'system',
        label: '给 AI 的长期要求',
        type: 'textarea',
        level: 'advanced',
        placeholder: '例如：你是专业的科普作者，说话要通俗易懂。',
        hint: '每次都生效的规矩，比如它该扮演谁、要注意什么',
      },
      MAX_TOKENS_FIELD,
    ],
  },

  chain: {
    plain: '让 AI 先想清楚再回答，答案通常更靠谱。适合需要算一算、推一推的问题。',
    skillTarget: true,
    skillField: 'guide',
    resultName: '答案',
    fields: [
      {
        key: 'question',
        label: '要它想清楚的问题',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '例如：一个班 30 人，男生是女生的 2 倍，男生几人？',
        hint: '用下面的按钮可以把别的节点结果放进来',
      },
      MODEL_FIELD,
      {
        key: 'steps',
        label: '分几步想',
        type: 'number',
        level: 'basic',
        min: 1,
        max: 10,
        step: 1,
        hint: '写 3 到 5 步就够，太多反而绕',
      },
      {
        key: 'guide',
        label: '要求它怎么想',
        type: 'textarea',
        level: 'advanced',
        hint: '规定思考的规矩，一般不用改',
      },
    ],
  },

  agent: {
    plain: '给 AI 配几样「工具」，它会自己判断什么时候该用，再用查到的结果回答你。',
    skillTarget: true,
    skillField: 'system',
    resultName: '回答',
    fields: [
      {
        key: 'prompt',
        label: '要问它什么',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '例如：北京今天天气怎么样？',
        hint: '用下面的按钮可以把别的节点结果放进来',
      },
      MODEL_FIELD,
      {
        key: 'tools',
        label: '它能用哪些工具',
        type: 'code',
        level: 'advanced',
        hint: '已经填好了一个「查天气」的例子，照葫芦画瓢改就行',
      },
      {
        key: 'system',
        label: '给 AI 的长期要求',
        type: 'textarea',
        level: 'advanced',
        placeholder: '例如：先查资料再回答，不要凭空猜测。',
        hint: '每次都生效的规矩',
      },
      {
        key: 'maxRounds',
        label: '最多来回几次',
        type: 'number',
        level: 'advanced',
        min: 1,
        max: 6,
        step: 1,
        hint: '防止它一直查个不停',
      },
    ],
  },

  tool: {
    plain: '直接去访问一个网址，把拿回来的内容交给后面的节点用。',
    resultName: '返回',
    fields: [
      {
        key: 'url',
        label: '要访问的网址',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: 'https://api.example.com/data',
      },
      {
        key: 'method',
        label: '做什么操作',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'GET', label: '只是去看看（读数据）' },
          { value: 'POST', label: '提交新内容' },
          { value: 'PUT', label: '修改已有内容' },
          { value: 'DELETE', label: '删掉内容' },
        ],
      },
      {
        key: 'headers',
        label: '要带上的身份信息',
        type: 'textarea',
        level: 'advanced',
        placeholder: 'Authorization: Bearer xxxxx',
        hint: '大多数要登录的接口才需要填，每行一条',
      },
      {
        key: 'body',
        label: '要发过去的内容',
        type: 'textarea',
        level: 'advanced',
        hint: '只有提交或修改时才用得上',
      },
    ],
  },

  fetch: {
    plain: '把一个网页的内容抓下来，变成干净的纯文字，这样 AI 就能读懂了。',
    resultName: '正文',
    fields: [
      {
        key: 'url',
        label: '网页地址',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: 'https://example.com/article',
        hint: '把浏览器上方的网址复制进来即可',
      },
      {
        key: 'extract',
        label: '抓成什么样子',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'markdown', label: '干净的正文（推荐）' },
          { value: 'text', label: '纯文字，去掉所有排版' },
          { value: 'raw', label: '原封不动全抓下来' },
        ],
      },
      {
        key: 'timeout',
        label: '最多等多少秒',
        type: 'number',
        level: 'advanced',
        min: 5,
        max: 120,
        step: 5,
        hint: '网页太慢一直转圈，可以调大一点',
      },
      {
        key: 'proxy',
        label: '经由哪个中转站',
        type: 'text',
        level: 'advanced',
        placeholder: 'https://r.jina.ai/',
        hint: '浏览器直接抓别人网站常被拦住，所以默认绕个弯，一般不用改',
      },
      {
        key: 'headers',
        label: '要带上的身份信息',
        type: 'textarea',
        level: 'advanced',
        hint: '每行一条，一般不用填',
      },
    ],
  },

  condition: {
    plain: '做一个「如果……那就……」的判断，让工作流岔到不同的路上去。',
    resultName: '判断',
    fields: [
      {
        key: 'expression',
        label: '在什么情况下算「是」',
        type: 'code',
        level: 'basic',
        primary: true,
        placeholder: '例如：结果的字数 大于 100',
        hint: '成立就往右边的线走，不成立就往下面的线走',
      },
    ],
  },

  merge: {
    plain: '把前面几条线汇到一起，合成一份内容，再继续往下走。',
    resultName: '汇总',
    fields: [
      {
        key: 'mode',
        label: '怎么合',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'concat', label: '一段接一段拼起来（推荐）' },
          { value: 'json', label: '整理成一个列表' },
          { value: 'first', label: '只要第一条线的' },
          { value: 'last', label: '只要最后一条线的' },
          { value: 'template', label: '自己写格式拼' },
        ],
      },
      {
        key: 'separator',
        label: '每段之间加什么',
        type: 'text',
        level: 'basic',
        placeholder: '（默认空一行）',
        hint: '填 \n 就是换行',
        vars: false,
      },
      {
        key: 'template',
        label: '自己写拼接格式',
        type: 'textarea',
        level: 'advanced',
        placeholder: '用在「自己写格式拼」的时候',
        hint: '把上面的按钮点一点，就能把各条线的结果摆到你想放的位置',
      },
    ],
  },

  loop: {
    plain: '把一大段内容切成几小段，让 AI 每一小段都处理一遍，比如逐段做总结。',
    skillTarget: true,
    skillField: 'system',
    resultName: '结果',
    fields: [
      {
        key: 'source',
        label: '要处理的内容',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '用上面的按钮把长文本放进来',
        hint: '这段内容会被切开，一小段一小段地处理',
      },
      {
        key: 'itemPrompt',
        label: '每一小段要做什么',
        type: 'textarea',
        level: 'basic',
        placeholder: '例如：请用一句话总结下面这段内容：',
        hint: '「当前这一小段」会自动放在内容里，不用你写',
      },
      MODEL_FIELD,
      {
        key: 'separator',
        label: '按什么切开',
        type: 'text',
        level: 'advanced',
        placeholder: '（默认空一行）',
        hint: '比如填「---」就按分隔线切',
        vars: false,
      },
      {
        key: 'maxItems',
        label: '最多处理几段',
        type: 'number',
        level: 'advanced',
        min: 1,
        max: 50,
        step: 1,
        hint: '防止内容太长跑太久',
      },
      {
        key: 'system',
        label: '给 AI 的长期要求',
        type: 'textarea',
        level: 'advanced',
        hint: '每次都生效的规矩',
      },
    ],
  },

  code: {
    plain: '用一小段程序来加工文字，比如截取、替换、拼装。不熟悉可以跳过这个节点。',
    resultName: '结果',
    fields: [
      {
        key: 'expression',
        label: '要做什么加工',
        type: 'code',
        level: 'basic',
        primary: true,
        placeholder: '例如：把文字全部变成大写',
        hint: '这是给懂编程的人准备的高级功能，不懂请用别的节点',
      },
    ],
  },

  output: {
    plain: '整个工作流的终点，最终结果会在这里显示出来。',
    resultName: '内容',
    fields: [
      {
        key: 'template',
        label: '最后要展示什么',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '用上面的按钮，把你想展示的结果点进来',
        hint: '可以放好几样结果，前后加文字说明也完全可以',
      },
    ],
  },
};

/** ============================================================
 *  数据整理类（纯函数，不联网）
 *  ============================================================ */
const DATA_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  pick: {
    plain: '前面给过来的东西可能有好几项，这里只留下你真正要用的那几项。',
    resultName: '结果',
    fields: [
      {
        key: 'fields',
        label: '要留下哪几项',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '例如：标题, 作者',
        hint: '用逗号隔开。名字要和前面的内容对得上，不对应的会被丢掉',
        vars: false,
      },
      {
        key: 'missing',
        label: '找不到的项怎么办',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'skip', label: '直接不要了' },
          { value: 'empty', label: '留个空位' },
        ],
        hint: '前面没有这一项时，是跳过还是留空',
        vars: false,
      },
    ],
  },

  filter: {
    plain: '把一堆内容按关键词筛一遍，只要符合条件的，其余的丢掉。',
    resultName: '结果',
    fields: [
      {
        key: 'keyword',
        label: '看关键词',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '例如：AI',
        hint: '留空就一条都不筛，原样往下传',
        vars: false,
      },
      {
        key: 'mode',
        label: '怎么算符合',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'contains', label: '含有这个词' },
          { value: 'notContains', label: '不含这个词' },
          { value: 'startsWith', label: '以它开头' },
          { value: 'endsWith', label: '以它结尾' },
        ],
        vars: false,
      },
    ],
  },

  sort: {
    plain: '把一堆内容按顺序排好。可以按文字先后、按长短、或按数字大小。',
    resultName: '结果',
    fields: [
      {
        key: 'by',
        label: '按什么排',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'text', label: '按文字先后' },
          { value: 'length', label: '按长短' },
          { value: 'number', label: '按数字大小' },
        ],
        vars: false,
      },
      {
        key: 'order',
        label: '从小到大还是从大到小',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'asc', label: '从小到大' },
          { value: 'desc', label: '从大到小' },
        ],
        vars: false,
      },
    ],
  },

  limit: {
    plain: '内容太多的时候，只留下前面几条（或者最后几条），后面的不要了。',
    resultName: '结果',
    fields: [
      {
        key: 'count',
        label: '留下几条',
        type: 'number',
        level: 'basic',
        primary: true,
        min: 1,
        placeholder: '例如：5',
        hint: '填 0 表示不限制，全都留下',
        vars: false,
      },
      {
        key: 'from',
        label: '从头数还是从尾数',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'head', label: '留最前面的' },
          { value: 'tail', label: '留最后面的' },
        ],
        vars: false,
      },
    ],
  },

  dedupe: {
    plain: '一堆内容里如果有重复的，只保留一条，其余的删掉。',
    resultName: '结果',
    fields: [
      {
        key: 'ignoreCase',
        label: '大小写算不算一样',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'no', label: '算不一样' },
          { value: 'yes', label: '算一样' },
        ],
        hint: '比如 Hello 和 hello 是否当作同一条',
        vars: false,
      },
    ],
  },

  splitout: {
    plain: '把一大段内容按某个记号切开，变成一条一条的，方便后面逐条处理。',
    resultName: '结果',
    fields: [
      {
        key: 'separator',
        label: '按什么切开',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '不填就按换行切',
        hint: '填一个出现的记号即可，比如 --- 或换行',
        vars: false,
      },
    ],
  },

  aggregate: {
    plain: '把好几条内容合到一起当成一组，交给后面的节点一起处理。',
    resultName: '结果',
    fields: [
      {
        key: 'separator',
        label: '合并时中间加什么',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '不填就直接接上',
        hint: '想让每条之间空一行，可以填 \\n\\n',
        vars: false,
      },
    ],
  },

  summarize: {
    plain: '对一堆数字做点计算：数个数、求和、算平均、找最大最小。',
    resultName: '结果',
    fields: [
      {
        key: 'op',
        label: '算什么',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'count', label: '数一数有几条' },
          { value: 'sum', label: '加起来是多少' },
          { value: 'average', label: '平均是多少' },
          { value: 'max', label: '最大是多少' },
          { value: 'min', label: '最小是多少' },
          { value: 'unique', label: '不重复的有几条' },
          { value: 'join', label: '直接连成一段' },
        ],
        vars: false,
      },
      {
        key: 'separator',
        label: '连成一段时中间加什么',
        type: 'text',
        level: 'advanced',
        placeholder: '不填就按换行',
        hint: '只有选「直接连成一段」时才用得上',
        vars: false,
      },
    ],
  },

  renamekeys: {
    plain: '把内容里各项的名字换成你想要的名字，方便后面统一引用。',
    resultName: '结果',
    fields: [
      {
        key: 'mapping',
        label: '怎么改',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '一行一条，例如：\n原标题=新标题\n原作者=作者',
        hint: '等号左边是原来的名字，右边是想改成的名字',
        vars: false,
      },
    ],
  },
};

/** ============================================================
 *  文字处理类
 *  ============================================================ */
const TEXT_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  markdown: {
    plain: '把「带记号写的文字」和「网页排版的文字」互相转一下，两种写法都能用。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '要转换的文字',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '点上面的按钮把前面节点的结果放进来',
        hint: '通常接在「让 AI 干活」后面，把 AI 写的结果转成网页能显示的样式',
      },
      {
        key: 'direction',
        label: '往哪个方向转',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'md2html', label: '转成网页排版' },
          { value: 'html2md', label: '转成带记号的写法' },
        ],
        vars: false,
      },
    ],
  },

  html: {
    plain: '网页那段代码里挑出你要的部分，比如所有标题、所有链接。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '网页代码',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '把「读网页」抓到的内容放进来',
        hint: '先用「读网页」把网页抓下来，再接到这里处理',
      },
      {
        key: 'op',
        label: '要做什么',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'toText', label: '去掉所有标签，只留文字' },
          { value: 'extract', label: '挑出指定的部分' },
        ],
        vars: false,
      },
      {
        key: 'selector',
        label: '挑什么样的部分',
        type: 'text',
        level: 'advanced',
        placeholder: '例如：h2 表示所有二级标题，a 表示所有链接',
        hint: '只有选「挑出指定的部分」时才用得上',
        vars: false,
      },
      {
        key: 'attr',
        label: '取它的哪一项',
        type: 'text',
        level: 'advanced',
        placeholder: '不填就取文字内容',
        hint: '比如链接要取 href，图片要取 src',
        vars: false,
      },
    ],
  },

  xml: {
    plain: '有些接口给的是「尖括号那套写法」，这里把它转成能直接读的样子，或者反过来。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '要转换的内容',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '把前面节点的结果放进来',
        hint: '接在「访问网址」后面最常见',
      },
      {
        key: 'direction',
        label: '往哪个方向转',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'xml2obj', label: '转成能读的样子' },
          { value: 'obj2xml', label: '转成尖括号写法' },
        ],
        vars: false,
      },
    ],
  },

  findreplace: {
    plain: '在文字里找出某个内容，换成别的。适合批量改名、清理多余符号。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '要处理的文字',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '把前面节点的结果放进来',
      },
      {
        key: 'find',
        label: '找出什么',
        type: 'text',
        level: 'basic',
        placeholder: '要替换掉的内容',
        hint: '留空就什么都不换',
        vars: false,
      },
      {
        key: 'replace',
        label: '换成什么',
        type: 'text',
        level: 'basic',
        placeholder: '留空表示直接删掉',
        vars: false,
      },
      {
        key: 'all',
        label: '全部都换吗',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'yes', label: '找到的都换' },
          { value: 'no', label: '只换第一处' },
        ],
        vars: false,
      },
      {
        key: 'ignoreCase',
        label: '大小写算不算一样',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'no', label: '算不一样' },
          { value: 'yes', label: '算一样' },
        ],
        vars: false,
      },
      {
        key: 'regex',
        label: '用高级匹配吗',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'no', label: '不用，就按原文找' },
          { value: 'yes', label: '用（会写规则的人用）' },
        ],
        hint: '不确定就选「不用」，免得规则写错',
        vars: false,
      },
    ],
  },

  slice: {
    plain: '从一段文字里截取其中一部分：按第几段来取，或者按第几个字到第几个字取。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '要处理的文字',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '把前面节点的结果放进来',
      },
      {
        key: 'bySeparator',
        label: '怎么取',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'yes', label: '按第几段取' },
          { value: 'no', label: '按第几个字取' },
        ],
        vars: false,
      },
      {
        key: 'separator',
        label: '按什么分段',
        type: 'text',
        level: 'advanced',
        placeholder: '不填就按换行分段',
        vars: false,
      },
      {
        key: 'index',
        label: '要第几段',
        type: 'number',
        level: 'advanced',
        min: 0,
        hint: '从 1 开始数：第 1 段就填 1',
        vars: false,
      },
      {
        key: 'from',
        label: '从第几个字开始',
        type: 'number',
        level: 'advanced',
        min: 0,
        hint: '从 1 开始数；留空或填 0 表示从头开始',
        vars: false,
      },
      {
        key: 'to',
        label: '到第几个字为止',
        type: 'number',
        level: 'advanced',
        min: 0,
        hint: '填 0 表示一直到结尾',
        vars: false,
      },
    ],
  },
};

/** ============================================================
 *  日期与编码类
 *  ============================================================ */
const CODEC_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  datetime: {
    plain: '拿当前时间、把日期换成别的写法、往后推几天、算两个日子差多少天。',
    resultName: '结果',
    fields: [
      {
        key: 'op',
        label: '要算什么',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'now', label: '取现在的时间' },
          { value: 'format', label: '把日期换个写法' },
          { value: 'add', label: '往后推 / 往前推几天' },
          { value: 'diff', label: '两个日子差几天' },
          { value: 'weekday', label: '这天是星期几' },
        ],
        vars: false,
      },
      {
        key: 'source',
        label: '要处理的日期',
        type: 'text',
        level: 'basic',
        placeholder: '点上面的按钮把前面节点的结果放进来',
        hint: '选「取现在的时间」时可以留空',
      },
      {
        key: 'format',
        label: '想显示成什么样',
        type: 'text',
        level: 'basic',
        placeholder: '例如：YYYY-MM-DD',
        hint: 'YYYY 是年，MM 是月，DD 是日，HH 是小时，mm 是分，ss 是秒',
        vars: false,
      },
      {
        key: 'amount',
        label: '推几天',
        type: 'number',
        level: 'advanced',
        hint: '正数是往后推，负数是往前推',
        vars: false,
      },
      {
        key: 'unit',
        label: '按什么单位推',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'day', label: '天' },
          { value: 'hour', label: '小时' },
          { value: 'minute', label: '分钟' },
          { value: 'month', label: '月' },
          { value: 'year', label: '年' },
        ],
        vars: false,
      },
      {
        key: 'target',
        label: '和哪一天比',
        type: 'text',
        level: 'advanced',
        placeholder: '例如：2026-12-31',
        hint: '只有选「两个日子差几天」时才用得上',
        vars: false,
      },
    ],
  },

  crypto: {
    plain: '给内容算一个「指纹」（内容变一点指纹就完全不同），或者生成一串随机字符。',
    resultName: '结果',
    fields: [
      {
        key: 'op',
        label: '要做什么',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'hash', label: '算一个指纹' },
          { value: 'hmac', label: '带密钥算一个签名' },
          { value: 'random', label: '生成一串随机字符' },
        ],
        vars: false,
      },
      {
        key: 'text',
        label: '要给什么内容算',
        type: 'textarea',
        level: 'basic',
        placeholder: '点上面的按钮把前面节点的结果放进来',
        hint: '只有生成随机字符时不用填',
      },
      {
        key: 'algorithm',
        label: '用哪种算法',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'SHA-256', label: 'SHA-256（常用）' },
          { value: 'SHA-1', label: 'SHA-1（老一些）' },
          { value: 'SHA-384', label: 'SHA-384' },
          { value: 'SHA-512', label: 'SHA-512（更长更安全）' },
        ],
        hint: '不确定就用 SHA-256',
        vars: false,
      },
      {
        key: 'secret',
        label: '密钥',
        type: 'text',
        level: 'advanced',
        placeholder: '只有算签名时才需要填',
        vars: false,
      },
      {
        key: 'length',
        label: '生成多长',
        type: 'number',
        level: 'advanced',
        min: 1,
        hint: '想要几个字符就填几',
        vars: false,
      },
      {
        key: 'randomKind',
        label: '随机字符里放什么',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'alnum', label: '字母加数字' },
          { value: 'hex', label: '只用 0-9 和 a-f' },
          { value: 'number', label: '只用数字' },
        ],
        vars: false,
      },
    ],
  },

  encode: {
    plain: '把文字换一种存放方式，或者把换过的写法还原回来。常见于处理网址和乱码。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '要转换的文字',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '点上面的按钮把前面节点的结果放进来',
      },
      {
        key: 'op',
        label: '怎么转',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'b64enc', label: '换成一串字母数字' },
          { value: 'b64dec', label: '从字母数字还原回来' },
          { value: 'urlenc', label: '换成网址里能用的样子' },
          { value: 'urldec', label: '从网址写法还原回来' },
          { value: 'htmlenc', label: '换成网页代码里的写法' },
          { value: 'htmldec', label: '从网页代码写法还原回来' },
        ],
        vars: false,
      },
    ],
  },

  totp: {
    plain: '按密钥生成一个几十秒就换一次的口令，和手机上的验证器是同一套算法。',
    resultName: '口令',
    fields: [
      {
        key: 'secret',
        label: '口令密钥',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '一串大写字母和数字',
        hint: '就是绑定验证器时给出的那串密钥，比如 JBSWY3DPEHPK3PXP',
        vars: false,
      },
      {
        key: 'digits',
        label: '口令有几位',
        type: 'number',
        level: 'advanced',
        min: 4,
        max: 10,
        hint: '一般是 6 位',
        vars: false,
      },
      {
        key: 'period',
        label: '多少秒换一次',
        type: 'number',
        level: 'advanced',
        min: 1,
        hint: '一般是 30 秒',
        vars: false,
      },
      {
        key: 'algorithm',
        label: '用哪种算法',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'SHA-1', label: 'SHA-1（最常见）' },
          { value: 'SHA-256', label: 'SHA-256' },
          { value: 'SHA-512', label: 'SHA-512' },
        ],
        vars: false,
      },
    ],
  },

  jwt: {
    plain: '把一串登录凭证解开看里面写了什么，或者按内容生成一串。',
    resultName: '结果',
    fields: [
      {
        key: 'op',
        label: '要做什么',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'decode', label: '解开看看里面写了什么' },
          { value: 'sign', label: '按内容生成一串' },
        ],
        vars: false,
      },
      {
        key: 'token',
        label: '那串凭证',
        type: 'textarea',
        level: 'basic',
        placeholder: '形如 aaa.bbb.ccc 的一长串',
        hint: '只有「解开看看」时才用得上',
      },
      {
        key: 'payload',
        label: '里面要写什么',
        type: 'textarea',
        level: 'advanced',
        placeholder: '例如：{"user":"小明"}',
        hint: '只有「生成一串」时才用得上',
        vars: false,
      },
      {
        key: 'secret',
        label: '密钥',
        type: 'text',
        level: 'advanced',
        placeholder: '生成时需要填',
        vars: false,
      },
    ],
  },
};

/** ============================================================
 *  网络类（走跨域治理层；只收录实测支持跨域、免密钥的源）
 *  ============================================================ */
const NET_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  hn: {
    plain: '把技术圈正在热议的话题榜单拿下来，可以接着让 AI 帮你总结。',
    resultName: '榜单',
    fields: [
      {
        key: 'source',
        label: '看哪个榜',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'hn-top', label: '热门榜' },
          { value: 'hn-new', label: '最新榜' },
        ],
        vars: false,
      },
      {
        key: 'count',
        label: '拿几条',
        type: 'number',
        level: 'basic',
        min: 1,
        max: 50,
        hint: '建议 5~15 条，太多会慢',
        vars: false,
      },
    ],
  },

  rss: {
    plain: '把一个订阅地址（那种给阅读器用的）里的最新文章标题和链接拿下来。',
    resultName: '文章',
    fields: [
      {
        key: 'url',
        label: '订阅地址',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '以 .xml 或 /feed 结尾的那种地址',
        hint: '很多网站的页脚会写「RSS」或「订阅」，点进去就是它',
      },
      {
        key: 'count',
        label: '拿几篇',
        type: 'number',
        level: 'advanced',
        min: 1,
        max: 50,
        vars: false,
      },
    ],
  },

  chart: {
    plain: '把一串数字画成柱状图、折线图或饼图，生成一张图片地址，可以直接展示。',
    resultName: '图片',
    fields: [
      {
        key: 'chartType',
        label: '画成什么图',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'bar', label: '柱状图' },
          { value: 'line', label: '折线图' },
          { value: 'pie', label: '饼图' },
          { value: 'doughnut', label: '圆环图' },
        ],
        vars: false,
      },
      {
        key: 'labels',
        label: '每根柱子叫什么',
        type: 'text',
        level: 'basic',
        placeholder: '用逗号隔开，例如：一月, 二月, 三月',
        hint: '有几项就和下面的数字一样多',
      },
      {
        key: 'values',
        label: '每根柱子多高',
        type: 'text',
        level: 'basic',
        placeholder: '用逗号隔开，例如：10, 20, 15',
        hint: '可以点上面的按钮把前面算出来的数字放进来',
      },
      {
        key: 'title',
        label: '图表的标题',
        type: 'text',
        level: 'advanced',
        placeholder: '可以不填',
        vars: false,
      },
    ],
  },

  fact: {
    plain: '随机拿一条冷知识或猫的小知识，用来测试流程、或者当内容素材。',
    resultName: '内容',
    fields: [
      {
        key: 'source',
        label: '从哪儿拿',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'uselessfacts', label: '冷知识' },
          { value: 'catfact', label: '聊聊猫' },
        ],
        vars: false,
      },
    ],
  },
};

/** ============================================================
 *  流程控制补充
 *  ============================================================ */
const FLOW_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  wait: {
    plain: '先等几秒再继续。用在需要给对端一点缓冲、或者不想请求太快的时候。',
    resultName: '内容',
    fields: [
      {
        key: 'seconds',
        label: '等几秒',
        type: 'number',
        level: 'basic',
        primary: true,
        min: 0,
        max: 60,
        hint: '最多 60 秒，太久了体验不好',
      },
    ],
  },

  switch: {
    plain: '看前面的内容里出现了哪个关键词，就让它走对应的那条路。可以有好多条路。',
    resultName: '判断',
    fields: [
      {
        key: 'routes',
        label: '怎么分路',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '一行一条，例如：\n新闻=走新闻那条\n教程=走教程那条',
        hint: '等号左边是关键词，右边是这条路的名字（会显示在节点右边的小圆点上）',
        vars: false,
      },
      {
        key: 'fallback',
        label: '哪个关键词都没出现怎么办',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'yes', label: '走「其它」那条路' },
          { value: 'no', label: '哪条都不走' },
        ],
        vars: false,
      },
    ],
  },

  stop: {
    plain: '到这里主动停下来并提示一句话。用来挡住不合格的内容，不让它继续往下走。',
    resultName: '内容',
    fields: [
      {
        key: 'message',
        label: '停下来时说什么',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '例如：内容太短了，先补齐再继续。',
        hint: '这句话会显示在运行记录里',
      },
      {
        key: 'when',
        label: '什么时候停',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'always', label: '每次到这里都停' },
          { value: 'ifEmpty', label: '上面没内容时才停' },
        ],
        vars: false,
      },
    ],
  },
};

/**
 * 完整字段表 = 原有节点 + 数据整理 + 文字处理 + 日期与编码 + 网络 + 流程。
 *
 * 用 Object.assign 合并而不是写成一个大对象，是为了让每一类各自成块、
 * 好找好改；合并后仍断言为 Record<NodeKind, ...>，
 * 所以【任何一类漏登记某个节点，这里都会编译报错】。
 */
export const NODE_FIELDS = Object.assign(
  {},
  BASE_FIELDS,
  DATA_FIELDS,
  TEXT_FIELDS,
  CODEC_FIELDS,
  NET_FIELDS,
  FLOW_FIELDS,
) as Record<NodeKind, NodeFieldSpec>;
export function primaryFieldOf(kind: NodeKind): string {
  const spec = NODE_FIELDS[kind];
  const found = spec.fields.find((f) => f.primary);
  return found?.key ?? spec.fields[0]?.key ?? '';
}

/** 该字段是否允许插入上游结果（默认：文本框 / 多行框 / 代码框） */
export function fieldAcceptsVars(def: FieldDef): boolean {
  if (def.vars !== undefined) return def.vars;
  return def.type === 'text' || def.type === 'textarea' || def.type === 'code';
}
