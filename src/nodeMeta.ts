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
    group: 'action',
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
    group: 'action',
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
};

/** 侧栏分区的展示顺序与标题 */
export const NODE_GROUPS: { key: NodeMeta['group']; title: string }[] = [
  { key: 'input', title: '从哪开始' },
  { key: 'ai', title: '让 AI 干活' },
  { key: 'action', title: '去网上取东西' },
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
