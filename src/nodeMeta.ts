import type { NodeKind, NodeMeta, FlowNodeData } from './types';
import { nanoid } from 'nanoid';

/** 11 类节点的元信息：名称、描述、徽标、配色、默认配置工厂 */
export const NODE_METAS: Record<NodeKind, NodeMeta> = {
  start: {
    kind: 'start',
    name: '开始',
    desc: '工作流入口 / 用户输入',
    plain: '这里是工作流的起点。写下一句话作为任务的输入，后面的节点都能引用它。',
    badge: 'IN',
    colorVar: '--nt-start',
    group: 'input',
    defaultConfig: () => ({ text: '请介绍人工智能的发展简史。' }),
  },

  llm: {
    kind: 'llm',
    name: '大模型',
    desc: '调用 LLM 生成文本',
    plain: '把任务交给 AI 处理。只要写清楚「要它做什么」，其余设置留默认就能跑。',
    badge: 'LLM',
    colorVar: '--nt-llm',
    group: 'ai',
    defaultConfig: () => ({
      model: '',
      system: '你是一个乐于助人的 AI 助手。',
      prompt: '{{start.text}}',
      temperature: 0.7,
      maxTokens: 1024,
    }),
  },

  chain: {
    kind: 'chain',
    name: '思维链',
    desc: '分步推理后给出答案',
    plain: '让 AI 先想清楚再回答。适合需要推理、计算、多步判断的问题，答案通常更靠谱。',
    badge: 'COT',
    colorVar: '--nt-chain',
    group: 'ai',
    defaultConfig: () => ({
      model: '',
      question: '{{start.text}}',
      steps: 3,
      guide: '请一步一步思考，每一步以「步骤1:」「步骤2:」开头，最后用「最终答案:」给出结论。',
    }),
  },

  agent: {
    kind: 'agent',
    name: '工具调用',
    desc: '让 AI 自主调用外部工具',
    plain: '给 AI 配上几件「工具」（比如查天气），它会自己决定什么时候用哪个，再给出答案。',
    badge: 'BOT',
    colorVar: '--nt-agent',
    group: 'ai',
    defaultConfig: () => ({
      model: '',
      system: '你可以调用提供的工具来获取信息，然后据此回答用户。',
      prompt: '{{start.text}}',
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
    name: 'HTTP 工具',
    desc: '真实调用外部 API',
    plain: '直接访问一个网址接口，把返回的内容交给后面的节点。',
    badge: 'API',
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
    name: '网页抓取',
    desc: '读取网页正文',
    plain: '把一个网页的内容抓下来变成纯文本，这样 AI 就能读它了。',
    badge: 'WEB',
    colorVar: '--nt-fetch',
    group: 'action',
    defaultConfig: () => ({
      url: '{{start.text}}',
      extract: 'markdown' as const,
      proxy: 'https://r.jina.ai/',
      headers: '',
      timeout: 30,
    }),
  },

  condition: {
    kind: 'condition',
    name: '条件分支',
    desc: '根据表达式分流',
    plain: '做一个「如果…就…」的判断，让工作流走不同的路。',
    badge: 'IF',
    colorVar: '--nt-condition',
    group: 'flow',
    defaultConfig: () => ({ expression: '{{llm.content}}.length > 0' }),
  },

  merge: {
    kind: 'merge',
    name: '合并汇聚',
    desc: '把多个上游汇成一份',
    plain: '把前面几条线汇到一起，变成一份内容再往下一步走。',
    badge: 'MRG',
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
    name: '循环批处理',
    desc: '对多条内容逐项处理',
    plain: '把一大段内容切成几小段，让 AI 每段都处理一遍（比如逐段总结）。',
    badge: 'LOOP',
    colorVar: '--nt-loop',
    group: 'flow',
    defaultConfig: () => ({
      model: '',
      source: '{{start.text}}',
      separator: '\n---\n',
      system: '你是一个乐于助人的 AI 助手。',
      itemPrompt: '请用一句话总结下面这段内容：\n\n{{item}}',
      maxItems: 10,
    }),
  },

  code: {
    kind: 'code',
    name: '代码变换',
    desc: 'JS 表达式处理数据',
    plain: '用一小段程序处理文本，例如截取、替换、拼装。不熟悉可以跳过。',
    badge: 'JS',
    colorVar: '--nt-code',
    group: 'flow',
    defaultConfig: () => ({ expression: 'return (input || "").toUpperCase();' }),
  },

  output: {
    kind: 'output',
    name: '输出',
    desc: '展示最终结果',
    plain: '工作流的终点，最终结果会在这里展示出来。',
    badge: 'OUT',
    colorVar: '--nt-output',
    group: 'output',
    defaultConfig: () => ({ template: '{{llm.content}}' }),
  },
};

/** 侧栏分区的展示顺序与标题 */
export const NODE_GROUPS: { key: NodeMeta['group']; title: string }[] = [
  { key: 'input', title: '输入' },
  { key: 'ai', title: 'AI 能力' },
  { key: 'action', title: '外部数据' },
  { key: 'flow', title: '流程控制' },
  { key: 'output', title: '输出' },
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
