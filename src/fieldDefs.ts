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

/** 字段描述表：新增节点只需在此登记，Inspector 自动渲染 */
export const NODE_FIELDS: Record<NodeKind, NodeFieldSpec> = {
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

/** 取某节点的主文本字段（用于变量快捷插入） */
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
