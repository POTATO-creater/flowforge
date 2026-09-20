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
        <NodeShell {...shell('start')} hasTarget={false}>
          <div className="node__preview">{S(cfg, 'text') || '（空输入）'}</div>
        </NodeShell>
      );

    case 'llm':
      return (
        <NodeShell {...shell('llm')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{S(cfg, 'model') || '默认模型'}</span>
          </div>
          <div className="node__preview">{S(cfg, 'prompt')}</div>
        </NodeShell>
      );

    case 'chain':
      return (
        <NodeShell {...shell('cot')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{S(cfg, 'steps') || '3'} 步</span>
            <span className="tag" style={{ marginLeft: 4 }}>
              {S(cfg, 'model') || '默认模型'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'question')}</div>
        </NodeShell>
      );

    case 'agent':
      return (
        <NodeShell {...shell('bot')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">工具调用</span>
            <span className="tag" style={{ marginLeft: 4 }}>
              ≤{S(cfg, 'maxRounds') || '3'} 轮
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'prompt')}</div>
        </NodeShell>
      );

    case 'tool':
      return (
        <NodeShell {...shell('api')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{S(cfg, 'method')}</span>
          </div>
          <div className="node__preview">{S(cfg, 'url')}</div>
        </NodeShell>
      );

    case 'fetch':
      return (
        <NodeShell {...shell('web')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{S(cfg, 'extract') || 'markdown'}</span>
          </div>
          <div className="node__preview">{S(cfg, 'url')}</div>
        </NodeShell>
      );

    case 'condition':
      return (
        <NodeShell
          {...shell('if', [
            { id: 'true', top: '34%' },
            { id: 'false', top: '66%' },
          ])}
        >
          <div className="node__preview">{S(cfg, 'expression')}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--st-success)' }}>→ true</span>
            <span style={{ color: 'var(--st-error)' }}>→ false</span>
          </div>
        </NodeShell>
      );

    case 'merge':
      return (
        <NodeShell {...shell('mrg')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{S(cfg, 'mode') || 'concat'}</span>
          </div>
          <div className="node__preview" style={{ color: 'var(--text-muted)' }}>
            汇聚所有上游输出
          </div>
        </NodeShell>
      );

    case 'loop':
      return (
        <NodeShell {...shell('loop')}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">≤{S(cfg, 'maxItems') || '10'} 项</span>
            <span className="tag" style={{ marginLeft: 4 }}>
              {S(cfg, 'model') || '默认模型'}
            </span>
          </div>
          <div className="node__preview">{S(cfg, 'itemPrompt')}</div>
        </NodeShell>
      );

    case 'code':
      return (
        <NodeShell {...shell('js')}>
          <div className="node__preview">{S(cfg, 'expression')}</div>
        </NodeShell>
      );

    case 'output':
      return (
        <NodeShell {...shell('out', [])}>
          <div className="node__preview">{S(cfg, 'template')}</div>
        </NodeShell>
      );
  }
}
