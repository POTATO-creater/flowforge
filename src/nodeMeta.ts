import type { NodeKind, NodeMeta, FlowNodeData } from './types';
import { nanoid } from 'nanoid';

/** 6 类节点的元信息：名称、描述、徽标、配色、默认配置工厂 */
export const NODE_METAS: Record<NodeKind, NodeMeta> = {
  start: {
    kind: 'start',
    name: '开始',
    desc: '工作流入口 / 用户输入',
    badge: 'IN',
    colorVar: '--nt-start',
    defaultConfig: () => ({ text: '请介绍人工智能的发展简史。' }),
  },
  llm: {
    kind: 'llm',
    name: '大模型',
    desc: '调用 LLM 生成文本',
    badge: 'LLM',
    colorVar: '--nt-llm',
    defaultConfig: () => ({
      model: '',
      system: '你是一个乐于助人的 AI 助手。',
      prompt: '{{start.text}}',
      temperature: 0.7,
      maxTokens: 1024,
    }),
  },
  tool: {
    kind: 'tool',
    name: 'HTTP 工具',
    desc: '真实调用外部 API',
    badge: 'API',
    colorVar: '--nt-tool',
    defaultConfig: () => ({
      method: 'GET',
      url: 'https://api.github.com/repos/facebook/react',
      headers: '',
      body: '',
    }),
  },
  condition: {
    kind: 'condition',
    name: '条件分支',
    desc: '根据表达式分流',
    badge: 'IF',
    colorVar: '--nt-condition',
    defaultConfig: () => ({ expression: '{{llm.content}}.length > 0' }),
  },
  code: {
    kind: 'code',
    name: '代码变换',
    desc: 'JS 表达式处理数据',
    badge: 'JS',
    colorVar: '--nt-code',
    defaultConfig: () => ({ expression: 'return (input || "").toUpperCase();' }),
  },
  output: {
    kind: 'output',
    name: '输出',
    desc: '展示最终结果',
    badge: 'OUT',
    colorVar: '--nt-output',
    defaultConfig: () => ({ template: '{{llm.content}}' }),
  },
};

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
