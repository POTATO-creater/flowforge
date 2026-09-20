// ============================================================
// 各节点的字段描述：驱动 Inspector 通用渲染 + 小白/大佬模式分级
// level: 'basic'    两种情况都显示
// level: 'advanced' 仅「大佬模式」显示（小白模式折叠进「高级设置」）
// ============================================================
import type { NodeKind, NodeFieldSpec, FieldDef } from './types';

/** 变量插入时该节点对外暴露的字段名（下游可引用） */
export const VAR_FIELD: Record<NodeKind, string> = {
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

/** 节点内可用于「应用技能」的字段（含 system prompt 的节点） */
export const SKILL_TARGETS: Partial<Record<NodeKind, string>> = {
  llm: 'system',
  chain: 'guide',
  agent: 'system',
  loop: 'system',
};

const MODEL_FIELD: FieldDef = {
  key: 'model',
  label: '模型',
  type: 'text',
  level: 'basic',
  placeholder: '留空则用设置里的默认模型',
  hint: '如 gpt-4o-mini',
};

const TEMPERATURE_FIELD: FieldDef = {
  key: 'temperature',
  label: '发散程度',
  type: 'number',
  level: 'advanced',
  min: 0,
  max: 2,
  step: 0.1,
  hint: '0 = 稳定保守，1 = 更有创意',
};

const MAX_TOKENS_FIELD: FieldDef = {
  key: 'maxTokens',
  label: '最长回复',
  type: 'number',
  level: 'advanced',
  min: 1,
  step: 1,
  hint: '单位 token，越大回复越长',
};

/** 字段描述表：新增节点只需在此登记，Inspector 自动渲染 */
export const NODE_FIELDS: Record<NodeKind, NodeFieldSpec> = {
  start: {
    plain: '写下一句话，作为整个工作流的输入。下游节点用 {{节点ID.text}} 引用它。',
    fields: [
      {
        key: 'text',
        label: '用户输入文本',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '例如：请介绍人工智能的发展简史。',
        hint: '下游用 {{节点ID.text}} 引用',
      },
    ],
  },

  llm: {
    plain: '把任务交给 AI。核心只要写清楚「要它做什么」，其余留默认即可。',
    skillTarget: true,
    skillField: 'system',
    fields: [
      MODEL_FIELD,
      {
        key: 'prompt',
        label: '要 AI 做什么',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '例如：请把下面内容总结成三句话。\n\n{{start.text}}',
        hint: '支持 {{变量}} 引用上游结果',
      },
      {
        key: 'system',
        label: '角色设定',
        type: 'textarea',
        level: 'advanced',
        placeholder: '你是一个乐于助人的 AI 助手。',
        hint: '告诉 AI 它是谁、要遵守什么规则',
      },
      TEMPERATURE_FIELD,
      MAX_TOKENS_FIELD,
    ],
  },

  chain: {
    plain: '让 AI 先分步思考再给结论。适合推理、计算、多步判断类问题。',
    skillTarget: true,
    skillField: 'guide',
    fields: [
      MODEL_FIELD,
      {
        key: 'question',
        label: '要思考的问题',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '{{start.text}}',
        hint: '支持 {{变量}}',
      },
      {
        key: 'steps',
        label: '思考步数',
        type: 'number',
        level: 'basic',
        min: 1,
        max: 10,
        step: 1,
        hint: '建议 3-5 步',
      },
      {
        key: 'guide',
        label: '思考引导语',
        type: 'textarea',
        level: 'advanced',
        hint: '规定 AI 的分步格式，通常保持默认即可',
      },
    ],
  },

  agent: {
    plain: '给 AI 配几件「工具」，它会自己决定什么时候调用，再用结果回答你。',
    skillTarget: true,
    skillField: 'system',
    fields: [
      MODEL_FIELD,
      {
        key: 'prompt',
        label: '用户问题',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '{{start.text}}',
        hint: '支持 {{变量}}',
      },
      {
        key: 'tools',
        label: '可用工具定义',
        type: 'code',
        level: 'advanced',
        hint: 'OpenAI tools 数组格式的 JSON',
      },
      {
        key: 'system',
        label: '角色设定',
        type: 'textarea',
        level: 'advanced',
      },
      {
        key: 'maxRounds',
        label: '最多调用轮数',
        type: 'number',
        level: 'advanced',
        min: 1,
        max: 6,
        step: 1,
        hint: '防止无限调用',
      },
    ],
  },

  tool: {
    plain: '直接访问一个网址接口，把返回内容交给后面的节点。',
    fields: [
      {
        key: 'method',
        label: '请求方法',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'GET', label: 'GET（读取）' },
          { value: 'POST', label: 'POST（提交）' },
          { value: 'PUT', label: 'PUT（更新）' },
          { value: 'DELETE', label: 'DELETE（删除）' },
        ],
      },
      {
        key: 'url',
        label: 'URL',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: 'https://api.example.com/data',
        hint: '支持 {{变量}}',
      },
      {
        key: 'headers',
        label: '请求头',
        type: 'textarea',
        level: 'advanced',
        placeholder: 'Authorization: Bearer xxx',
        hint: '每行一条，格式 Key: Value',
      },
      {
        key: 'body',
        label: '请求体 (JSON)',
        type: 'textarea',
        level: 'advanced',
        hint: '支持 {{变量}}',
      },
    ],
  },

  fetch: {
    plain: '把一个网页的内容抓下来变成纯文本，AI 就能读它了。',
    fields: [
      {
        key: 'url',
        label: '网页地址',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: 'https://example.com/article',
        hint: '支持 {{变量}}',
      },
      {
        key: 'extract',
        label: '提取方式',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'markdown', label: 'Markdown 正文（推荐）' },
          { value: 'text', label: '纯文本（去标签）' },
          { value: 'raw', label: '原始 HTML' },
        ],
      },
      {
        key: 'proxy',
        label: '抓取代理',
        type: 'text',
        level: 'advanced',
        placeholder: 'https://r.jina.ai/',
        hint: '浏览器直连第三方站点会被 CORS 拦截，故默认经只读文本代理；可换成你自己的网关',
      },
      {
        key: 'headers',
        label: '附加请求头',
        type: 'textarea',
        level: 'advanced',
        hint: '每行一条，格式 Key: Value',
      },
      {
        key: 'timeout',
        label: '超时（秒）',
        type: 'number',
        level: 'advanced',
        min: 5,
        max: 120,
        step: 5,
      },
    ],
  },

  condition: {
    plain: '做一个「如果…就…」的判断，让工作流走不同的路。写一个结果为真/假的表达式。',
    fields: [
      {
        key: 'expression',
        label: '判断条件',
        type: 'code',
        level: 'basic',
        primary: true,
        placeholder: '{{llm.content}}.length > 100',
        hint: '结果为真走右侧（true）分支，为假走下方（false）分支',
      },
    ],
  },

  merge: {
    plain: '把前面几条线汇到一起，合成一份内容再往下走。',
    fields: [
      {
        key: 'mode',
        label: '合并方式',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'concat', label: '依次拼接' },
          { value: 'template', label: '按模板组合' },
          { value: 'json', label: '合并为 JSON 数组' },
          { value: 'first', label: '只取第一个上游' },
          { value: 'last', label: '只取最后一个上游' },
        ],
      },
      {
        key: 'separator',
        label: '拼接分隔符',
        type: 'text',
        level: 'basic',
        placeholder: '\\n\\n---\\n\\n',
        hint: '仅「依次拼接」方式使用',
      },
      {
        key: 'template',
        label: '组合模板',
        type: 'textarea',
        level: 'advanced',
        placeholder: '{{llm_a.content}}\n\n{{llm_b.content}}',
        hint: '仅「按模板组合」方式使用，支持 {{变量}}',
      },
    ],
  },

  loop: {
    plain: '把长内容切成几小段，让 AI 每段都处理一遍，例如逐段总结。',
    skillTarget: true,
    skillField: 'system',
    fields: [
      MODEL_FIELD,
      {
        key: 'source',
        label: '待处理内容',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '{{start.text}}',
        hint: '会被按分隔符切成多项',
      },
      {
        key: 'itemPrompt',
        label: '每段要做什么',
        type: 'textarea',
        level: 'basic',
        placeholder: '请用一句话总结：\n\n{{item}}',
        hint: '用 {{item}} 代表当前这一段',
      },
      {
        key: 'separator',
        label: '切分分隔符',
        type: 'text',
        level: 'advanced',
        placeholder: '\\n---\\n',
        hint: '支持 \\n 换行转义',
      },
      {
        key: 'maxItems',
        label: '最多处理几项',
        type: 'number',
        level: 'advanced',
        min: 1,
        max: 50,
        step: 1,
        hint: '防止误烧 token',
      },
      {
        key: 'system',
        label: '角色设定',
        type: 'textarea',
        level: 'advanced',
      },
    ],
  },

  code: {
    plain: '用一小段程序处理文本。不熟悉 JavaScript 可以跳过这个节点。',
    fields: [
      {
        key: 'expression',
        label: '代码',
        type: 'code',
        level: 'basic',
        primary: true,
        placeholder: 'return (input || "").toUpperCase();',
        hint: '形如 return ...；上游结果在变量 input 上',
      },
    ],
  },

  output: {
    plain: '工作流的终点，最终结果会在这里展示。',
    fields: [
      {
        key: 'template',
        label: '输出内容',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '{{llm.content}}',
        hint: '用 {{变量}} 拼出最终文本',
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
