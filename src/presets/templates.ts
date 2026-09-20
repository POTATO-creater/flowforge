// ============================================================
// 内置工作流模板：结构与 serialize() 输出一致，可直接载入画布
// ============================================================
import type { WorkflowJSON } from '../types';

export interface TemplateMeta {
  id: string;
  name: string;
  desc: string;
  /** 用到的节点类型，用于卡片上展示徽标 */
  kinds: string[];
  /** 需要用户配置 API Key 才能运行 */
  needsKey: boolean;
  workflow: WorkflowJSON;
}

/** 便捷构造节点 */
function n(
  id: string,
  kind: string,
  label: string,
  x: number,
  y: number,
  config: Record<string, unknown>,
) {
  return { id, kind: kind as never, label, position: { x, y }, config: config as never };
}

function e(source: string, target: string, sourceHandle?: string) {
  return {
    id: `e_${source}_${target}_${sourceHandle ?? 'o'}`,
    source,
    target,
    sourceHandle: sourceHandle ?? null,
    targetHandle: null as string | null,
  };
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'tpl_summarize',
    name: '文章摘要器',
    desc: '给一个网址，抓取正文并输出三句话摘要。',
    kinds: ['start', 'fetch', 'llm', 'output'],
    needsKey: true,
    workflow: {
      version: 1,
      name: '文章摘要器',
      nodes: [
        n('start_a', 'start', '输入网址', 40, 200, { text: 'https://example.com/article' }),
        n('fetch_a', 'fetch', '抓取网页', 300, 200, {
          url: '{{输入网址.内容}}',
          extract: 'markdown',
          proxy: 'https://r.jina.ai/',
          headers: '',
          timeout: 30,
        }),
        n('llm_a', 'llm', '生成摘要', 560, 200, {
          model: '',
          system: '你是一位善于提炼要点的编辑。',
          prompt: '请阅读下面内容，用三句话总结核心信息，不要添加原文没有的内容。\n\n{{抓取网页.正文}}',
          temperature: 0.3,
          maxTokens: 512,
        }),
        n('out_a', 'output', '展示结果', 820, 200, { template: '{{生成摘要.结果}}' }),
      ],
      edges: [e('start_a', 'fetch_a'), e('fetch_a', 'llm_a'), e('llm_a', 'out_a')],
    },
  },

  {
    id: 'tpl_translate',
    name: '翻译 + 润色',
    desc: '先翻译再润色，两步串联，输出更自然的目标语言。',
    kinds: ['start', 'llm', 'output'],
    needsKey: true,
    workflow: {
      version: 1,
      name: '翻译 + 润色',
      nodes: [
        n('start_b', 'start', '输入原文', 40, 200, {
          text: '把下面这段话翻译成英文：\n\n（在此粘贴原文）',
        }),
        n('llm_b1', 'llm', '翻译', 300, 120, {
          model: '',
          system: '你是专业译者，自动判断源语言并译为对应语言，保留术语与语气。',
          prompt: '{{输入原文.内容}}',
          temperature: 0.2,
          maxTokens: 1024,
        }),
        n('llm_b2', 'llm', '润色', 560, 120, {
          model: '',
          system: '你是母语编辑。请在保持原意的前提下，让译文更自然地道，避免翻译腔。',
          prompt: '请润色下面这段译文，只输出润色后的结果：\n\n{{翻译.结果}}',
          temperature: 0.4,
          maxTokens: 1024,
        }),
        n('out_b', 'output', '展示结果', 820, 120, { template: '{{润色.结果}}' }),
      ],
      edges: [e('start_b', 'llm_b1'), e('llm_b1', 'llm_b2'), e('llm_b2', 'out_b')],
    },
  },

  {
    id: 'tpl_research',
    name: '双源调研对比',
    desc: '抓取两个网页，合并后用思维链对比分析。',
    kinds: ['start', 'fetch', 'merge', 'chain', 'output'],
    needsKey: true,
    workflow: {
      version: 1,
      name: '双源调研对比',
      nodes: [
        n('start_c', 'start', '输入两个网址', 40, 240, {
          text: '第一个网址\n---\n第二个网址',
        }),
        n('fetch_c1', 'fetch', '抓取来源 A', 300, 120, {
          url: '{{输入两个网址.内容}}',
          extract: 'markdown',
          proxy: 'https://r.jina.ai/',
          headers: '',
          timeout: 30,
        }),
        n('fetch_c2', 'fetch', '抓取来源 B', 300, 340, {
          url: '{{输入两个网址.内容}}',
          extract: 'markdown',
          proxy: 'https://r.jina.ai/',
          headers: '',
          timeout: 30,
        }),
        n('merge_c', 'merge', '合并两份材料', 560, 230, {
          mode: 'concat',
          separator: '\n\n===== 第二份材料 =====\n\n',
          template: '',
        }),
        n('chain_c', 'chain', '对比分析', 800, 230, {
          model: '',
          question: '请对比下面两份材料，指出它们的共同点、关键分歧，以及各自的论据强度。\n\n{{合并两份材料.汇总}}',
          steps: 4,
          guide: '请一步一步思考，每一步以「步骤1:」「步骤2:」开头，最后用「最终答案:」给出结论。',
        }),
        n('out_c', 'output', '展示结果', 1060, 230, { template: '{{对比分析.答案}}' }),
      ],
      edges: [
        e('start_c', 'fetch_c1'),
        e('start_c', 'fetch_c2'),
        e('fetch_c1', 'merge_c'),
        e('fetch_c2', 'merge_c'),
        e('merge_c', 'chain_c'),
        e('chain_c', 'out_c'),
      ],
    },
  },

  {
    id: 'tpl_batch',
    name: '批量分段摘要',
    desc: '把长文按分隔符切段，逐段总结后汇总。',
    kinds: ['start', 'loop', 'merge', 'output'],
    needsKey: true,
    workflow: {
      version: 1,
      name: '批量分段摘要',
      nodes: [
        n('start_d', 'start', '输入长文', 40, 220, {
          text: '第一段内容\n---\n第二段内容\n---\n第三段内容',
        }),
        n('loop_d', 'loop', '逐段总结', 300, 220, {
          model: '',
          source: '{{输入长文.内容}}',
          separator: '\n---\n',
          system: '你是一位善于提炼要点的编辑。',
          itemPrompt: '请用一句话总结下面这段内容，只输出总结本身：\n\n{{item}}',
          maxItems: 10,
        }),
        n('merge_d', 'merge', '汇总', 560, 220, {
          mode: 'concat',
          separator: '\n',
          template: '',
        }),
        n('out_d', 'output', '展示结果', 820, 220, {
          template: '## 分段总结\n\n{{汇总.汇总}}',
        }),
      ],
      edges: [e('start_d', 'loop_d'), e('loop_d', 'merge_d'), e('merge_d', 'out_d')],
    },
  },

  {
    id: 'tpl_agent',
    name: '带判断的问答助手',
    desc: '思维链作答后自动判断质量，合格直接输出，不合格走兜底。',
    kinds: ['start', 'chain', 'condition', 'output'],
    needsKey: true,
    workflow: {
      version: 1,
      name: '带判断的问答助手',
      nodes: [
        n('start_e', 'start', '输入问题', 40, 240, { text: '为什么天空是蓝色的？' }),
        n('chain_e', 'chain', '分步作答', 300, 240, {
          model: '',
          question: '{{输入问题.内容}}',
          steps: 3,
          guide: '请一步一步思考，每一步以「步骤1:」「步骤2:」开头，最后用「最终答案:」给出结论。',
        }),
        n('cond_e', 'condition', '答案够长吗', 560, 240, {
          expression: '{{分步作答.答案}}.length > 80',
        }),
        n('out_e1', 'output', '合格，展示答案', 820, 140, {
          template: '{{分步作答.答案}}',
        }),
        n('out_e2', 'output', '太短了，给提示', 820, 360, {
          template: '回答过短，建议在「分步作答」节点补充更多上下文后重试。\n\n当前答案：{{分步作答.答案}}',
        }),
      ],
      edges: [
        e('start_e', 'chain_e'),
        e('chain_e', 'cond_e'),
        e('cond_e', 'out_e1', 'true'),
        e('cond_e', 'out_e2', 'false'),
      ],
    },
  },
];

export function findTemplate(id: string): TemplateMeta | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
