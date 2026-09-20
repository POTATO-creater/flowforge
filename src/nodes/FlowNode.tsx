import { type NodeProps, type Node } from '@xyflow/react';
import type { FlowNodeData, NodeConfig } from '../types';
import { NODE_METAS } from '../nodeMeta';
import { NodeShell } from './NodeShell';
import { assertNever } from '../lib/assertNever';

type FlowNodeType = Node<FlowNodeData, 'flow'>;

/** 读取配置里的字符串字段（新增节点类型共用） */
function S(cfg: NodeConfig, key: string): string {
  const v = (cfg as unknown as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

export function FlowNode({ data, selected }: NodeProps<FlowNodeType>) {
  const meta = NODE_METAS[data.kind];
  const status = data.run?.status;
  const cfg = data.config;

  // 统一的渲染参数，避免每分支重复
  const shell = (kindLabel: string, sources?: { id: string; top: string }[]) => ({
    label: data.label,
    kindLabel,
    colorVar: meta.colorVar,
    selected,
    status,
    run: data.run,
    ...(sources ? { sources } : {}),
  });

  switch (data.kind) {
    case 'start':
      return (
        <NodeShell {...shell('输入')} hasTarget={false}>
          <div className="node__preview">{S(cfg, 'text') || '（还没写内容）'}</div>
        </NodeShell>
      );

    case 'llm':
      return (
        <NodeShell {...shell('AI')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{S(cfg, 'model') || '默认的 AI'}</span>
          </div>
          <div className="node__preview">{S(cfg, 'prompt')}</div>
        </NodeShell>
      );

    case 'chain':
      return (
        <NodeShell {...shell('想')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">分 {S(cfg, 'steps') || '3'} 步想</span>
            <span className="tag" style={{ marginLeft: 4 }}>
              {S(cfg, 'model') || '默认的 AI'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'question')}</div>
        </NodeShell>
      );

    case 'agent':
      return (
        <NodeShell {...shell('查')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">会用工具</span>
            <span className="tag" style={{ marginLeft: 4 }}>
              最多 {S(cfg, 'maxRounds') || '3'} 次
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'prompt')}</div>
        </NodeShell>
      );

    case 'tool':
      return (
        <NodeShell {...shell('网')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{S(cfg, 'method')}</span>
          </div>
          <div className="node__preview">{S(cfg, 'url')}</div>
        </NodeShell>
      );

    case 'fetch':
      return (
        <NodeShell {...shell('读')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">抓成文字</span>
          </div>
          <div className="node__preview">{S(cfg, 'url')}</div>
        </NodeShell>
      );

    case 'condition':
      return (
        <NodeShell
          {...shell('岔', [
            { id: 'true', top: '34%' },
            { id: 'false', top: '66%' },
          ])}
        >
          <div className="node__preview">{S(cfg, 'expression')}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--st-success)' }}>→ 成立走这</span>
            <span style={{ color: 'var(--st-error)' }}>→ 不成立走这</span>
          </div>
        </NodeShell>
      );

    case 'merge':
      return (
        <NodeShell {...shell('合')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">合成一份</span>
          </div>
          <div className="node__preview" style={{ color: 'var(--text-muted)' }}>
            把前面几条线的结果合在一起
          </div>
        </NodeShell>
      );

    case 'loop':
      return (
        <NodeShell {...shell('段')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">最多 {S(cfg, 'maxItems') || '10'} 段</span>
            <span className="tag" style={{ marginLeft: 4 }}>
              {S(cfg, 'model') || '默认的 AI'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'itemPrompt')}</div>
        </NodeShell>
      );

    case 'code':
      return (
        <NodeShell {...shell('码')}>
          <div className="node__preview">{S(cfg, 'expression')}</div>
        </NodeShell>
      );

    case 'output':
      return (
        <NodeShell {...shell('果', [])}>
          <div className="node__preview">{S(cfg, 'template')}</div>
        </NodeShell>
      );

    // ==================== 数据整理 ====================

    case 'pick':
      return (
        <NodeShell {...shell('挑')}>
          <div className="node__preview">{S(cfg, 'fields') || '还没填要留下哪几项'}</div>
        </NodeShell>
      );

    case 'filter':
      return (
        <NodeShell {...shell('筛')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{FILTER_MODE_TEXT[S(cfg, 'mode')] ?? '含有'}</span>
          </div>
          <div className="node__preview">{S(cfg, 'keyword') || '还没填关键词'}</div>
        </NodeShell>
      );

    case 'sort':
      return (
        <NodeShell {...shell('排')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{SORT_BY_TEXT[S(cfg, 'by')] ?? '按文字'}</span>
            <span className="tag" style={{ marginLeft: 4 }}>
              {S(cfg, 'order') === 'desc' ? '从大到小' : '从小到大'}
            </span>
          </div>
        </NodeShell>
      );

    case 'limit':
      return (
        <NodeShell {...shell('截')}>
          <div className="node__preview">
            {S(cfg, 'count') ? `留下 ${S(cfg, 'count')} 条` : '还没填留下几条'}
            {S(cfg, 'from') === 'tail' ? '（从最后数）' : '（从最前数）'}
          </div>
        </NodeShell>
      );

    case 'dedupe':
      return (
        <NodeShell {...shell('去')}>
          <div className="node__preview" style={{ color: 'var(--text-muted)' }}>
            重复的只保留一条
          </div>
        </NodeShell>
      );

    case 'splitout':
      return (
        <NodeShell {...shell('切')}>
          <div className="node__preview">
            按「{S(cfg, 'separator') || '换行'}」切开
          </div>
        </NodeShell>
      );

    case 'aggregate':
      return (
        <NodeShell {...shell('聚')}>
          <div className="node__preview" style={{ color: 'var(--text-muted)' }}>
            把好几条合成一组
          </div>
        </NodeShell>
      );

    case 'summarize':
      return (
        <NodeShell {...shell('算')}>
          <div className="node__preview">{SUMMARIZE_TEXT[S(cfg, 'op')] ?? '数一数'}</div>
        </NodeShell>
      );

    case 'renamekeys':
      return (
        <NodeShell {...shell('改')}>
          <div className="node__preview">{S(cfg, 'mapping') || '还没填怎么改'}</div>
        </NodeShell>
      );

    // ==================== 文字处理 ====================

    case 'markdown':
      return (
        <NodeShell {...shell('排')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">
              {S(cfg, 'direction') === 'html2md' ? '转成带记号写法' : '转成网页排版'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'text')}</div>
        </NodeShell>
      );

    case 'html':
      return (
        <NodeShell {...shell('标')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">
              {S(cfg, 'op') === 'extract' ? `挑出 ${S(cfg, 'selector') || '…'}` : '只留文字'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'text')}</div>
        </NodeShell>
      );

    case 'xml':
      return (
        <NodeShell {...shell('格')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">
              {S(cfg, 'direction') === 'obj2xml' ? '转成尖括号写法' : '转成能读的样子'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'text')}</div>
        </NodeShell>
      );

    case 'findreplace':
      return (
        <NodeShell {...shell('替')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{S(cfg, 'find') || '…'}</span>
            <span className="tag" style={{ marginLeft: 4 }}>
              → {S(cfg, 'replace') || '（删掉）'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'text')}</div>
        </NodeShell>
      );

    case 'slice':
      return (
        <NodeShell {...shell('取')}>
          <div className="node__preview">
            {S(cfg, 'bySeparator') === 'no'
              ? `取第 ${S(cfg, 'from') || '1'} 到第 ${S(cfg, 'to') || '末'} 个字`
              : `取第 ${S(cfg, 'index') || '1'} 段`}
          </div>
        </NodeShell>
      );

    // ==================== 日期与编码 ====================

    case 'datetime':
      return (
        <NodeShell {...shell('日')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{DATETIME_OP_TEXT[S(cfg, 'op')] ?? '取现在时间'}</span>
          </div>
          <div className="node__preview">{S(cfg, 'format')}</div>
        </NodeShell>
      );

    case 'crypto':
      return (
        <NodeShell {...shell('密')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">
              {S(cfg, 'op') === 'random'
                ? '生成随机字符'
                : S(cfg, 'op') === 'hmac'
                  ? '带密钥签名'
                  : S(cfg, 'algorithm') || 'SHA-256'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'text')}</div>
        </NodeShell>
      );

    case 'encode':
      return (
        <NodeShell {...shell('编')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{ENCODE_OP_TEXT[S(cfg, 'op')] ?? '编码'}</span>
          </div>
          <div className="node__preview">{S(cfg, 'text')}</div>
        </NodeShell>
      );

    case 'totp':
      return (
        <NodeShell {...shell('令')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">
              每 {S(cfg, 'period') || '30'} 秒换一次
            </span>
          </div>
          <div className="node__preview">
            {S(cfg, 'secret') ? '已填密钥' : '还没填口令密钥'}
          </div>
        </NodeShell>
      );

    case 'jwt':
      return (
        <NodeShell {...shell('牌')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">
              {S(cfg, 'op') === 'sign' ? '生成一串' : '解开看看'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'token') || S(cfg, 'payload')}</div>
        </NodeShell>
      );

    // ==================== 去网上取东西 ====================

    case 'hn': {
      const srcText =
        HN_SOURCE_TEXT[S(cfg, 'source')] ?? '热榜';
      return (
        <NodeShell {...shell('闻')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{srcText}</span>
            <span className="tag" style={{ marginLeft: 4 }}>
              前 {S(cfg, 'count') || '10'} 条
            </span>
          </div>
          <div className="node__preview">拿标题和链接</div>
        </NodeShell>
      );
    }

    case 'rss':
      return (
        <NodeShell {...shell('订')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">前 {S(cfg, 'count') || '10'} 条</span>
          </div>
          <div className="node__preview">{S(cfg, 'url') || '还没填订阅地址'}</div>
        </NodeShell>
      );

    case 'chart':
      return (
        <NodeShell {...shell('图')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{CHART_TYPE_TEXT[S(cfg, 'chartType')] ?? '柱状图'}</span>
          </div>
          <div className="node__preview">{S(cfg, 'title') || '还没填图名'}</div>
        </NodeShell>
      );

    case 'fact':
      return (
        <NodeShell {...shell('冷')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{FACT_SOURCE_TEXT[S(cfg, 'source')] ?? '随机一条'}</span>
          </div>
          <div className="node__preview">随便拿条冷知识</div>
        </NodeShell>
      );

    // ==================== 控制流程 ====================

    case 'wait':
      return (
        <NodeShell {...shell('等')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">停 {S(cfg, 'seconds') || '0'} 秒</span>
          </div>
          <div className="node__preview">等一会儿再继续</div>
        </NodeShell>
      );

    case 'switch':
      return (
        <NodeShell {...shell('岔')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{S(cfg, 'mode') === 'number' ? '按数字大小' : '按关键词'}</span>
          </div>
          <div className="node__preview">
            {S(cfg, 'routes') || '还没填往哪几路走'}
          </div>
        </NodeShell>
      );

    case 'stop':
      return (
        <NodeShell {...shell('停')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">
              {S(cfg, 'when') === 'always' ? '每次都停' : '内容空的时候停'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'message') || '说明为什么停'}</div>
        </NodeShell>
      );

    default:
      // 漏写 case 会在这里编译失败，而不是运行时卡片空白
      return assertNever(data.kind, 'FlowNode');
  }
}

/** 卡片预览用的人话对照表 */
const FILTER_MODE_TEXT: Record<string, string> = {
  contains: '含有这个词',
  notContains: '不含这个词',
  startsWith: '以它开头',
  endsWith: '以它结尾',
};

const SORT_BY_TEXT: Record<string, string> = {
  text: '按文字',
  length: '按长短',
  number: '按数字',
};

const SUMMARIZE_TEXT: Record<string, string> = {
  count: '数一数有几条',
  sum: '加起来是多少',
  average: '平均是多少',
  max: '最大是多少',
  min: '最小是多少',
  unique: '不重复的有几条',
  join: '连成一段',
};

const DATETIME_OP_TEXT: Record<string, string> = {
  now: '取现在时间',
  format: '换个写法',
  add: '往后推几天',
  diff: '差几天',
  weekday: '星期几',
};

const ENCODE_OP_TEXT: Record<string, string> = {
  b64enc: '换成一串字母数字',
  b64dec: '还原回来',
  urlenc: '换成网址写法',
  urldec: '从网址写法还原',
  htmlenc: '换成网页写法',
  htmldec: '从网页写法还原',
};

const HN_SOURCE_TEXT: Record<string, string> = {
  'hn-top': '热门榜',
  'hn-new': '最新榜',
};

const CHART_TYPE_TEXT: Record<string, string> = {
  bar: '柱状图',
  line: '折线图',
  pie: '饼图',
  doughnut: '圆环图',
};

const FACT_SOURCE_TEXT: Record<string, string> = {
  uselessfacts: '随机一条',
  catfact: '聊聊猫',
};
