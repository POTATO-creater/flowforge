import { type NodeProps, type Node } from '@xyflow/react';
import type { FlowNodeData } from '../types';
import { NODE_METAS } from '../nodeMeta';
import { NodeShell } from './NodeShell';

type FlowNodeType = Node<FlowNodeData, 'flow'>;

export function FlowNode({ data, selected }: NodeProps<FlowNodeType>) {
  const meta = NODE_METAS[data.kind];
  const status = data.run?.status;

  switch (data.kind) {
    case 'start': {
      const c = data.config as Extract<FlowNodeData['config'], { text: string }>;
      return (
        <NodeShell label={data.label} kindLabel="start" colorVar={meta.colorVar} selected={selected} status={status} hasTarget={false}>
          <div className="node__preview">{c.text || '（空输入）'}</div>
        </NodeShell>
      );
    }
    case 'llm': {
      const c = data.config as Extract<FlowNodeData['config'], { prompt: string }>;
      return (
        <NodeShell label={data.label} kindLabel="llm" colorVar={meta.colorVar} selected={selected} status={status}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{c.model || '默认模型'}</span>
          </div>
          <div className="node__preview">{c.prompt}</div>
        </NodeShell>
      );
    }
    case 'tool': {
      const c = data.config as Extract<FlowNodeData['config'], { url: string; method: string }>;
      return (
        <NodeShell label={data.label} kindLabel="tool" colorVar={meta.colorVar} selected={selected} status={status}>
          <div style={{ marginBottom: 6 }}>
            <span className="tag">{c.method}</span>
          </div>
          <div className="node__preview">{c.url}</div>
        </NodeShell>
      );
    }
    case 'condition': {
      const c = data.config as Extract<FlowNodeData['config'], { expression: string }>;
      return (
        <NodeShell
          label={data.label}
          kindLabel="if"
          colorVar={meta.colorVar}
          selected={selected}
          status={status}
          sources={[
            { id: 'true', top: '34%' },
            { id: 'false', top: '66%' },
          ]}
        >
          <div className="node__preview">{c.expression}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--st-success)' }}>→ true</span>
            <span style={{ color: 'var(--st-error)' }}>→ false</span>
          </div>
        </NodeShell>
      );
    }
    case 'code': {
      const c = data.config as Extract<FlowNodeData['config'], { expression: string }>;
      return (
        <NodeShell label={data.label} kindLabel="code" colorVar={meta.colorVar} selected={selected} status={status}>
          <div className="node__preview">{c.expression}</div>
        </NodeShell>
      );
    }
    case 'output': {
      const c = data.config as Extract<FlowNodeData['config'], { template: string }>;
      return (
        <NodeShell label={data.label} kindLabel="out" colorVar={meta.colorVar} selected={selected} status={status} sources={[]}>
          <div className="node__preview">{c.template}</div>
        </NodeShell>
      );
    }
  }
}
