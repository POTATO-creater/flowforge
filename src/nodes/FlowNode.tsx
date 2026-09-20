import { type NodeProps, type Node } from '@xyflow/react';
import type { FlowNodeData, NodeConfig } from '../types';
import { NODE_METAS } from '../nodeMeta';
import { NodeShell } from './NodeShell';

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
  }
}
