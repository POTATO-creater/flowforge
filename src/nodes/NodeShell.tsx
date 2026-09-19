import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import type { RunStatus } from '../types';

interface SourceHandleDef {
  id: string;
  label?: string;
  top: string; // CSS top 位置
}

interface NodeShellProps {
  label: string;
  kindLabel: string;
  colorVar: string;
  selected?: boolean;
  status?: RunStatus;
  hasTarget?: boolean;
  sources?: SourceHandleDef[];
  children?: ReactNode;
}

const STATUS_TEXT: Record<RunStatus, string> = {
  idle: '',
  running: '运行中',
  success: '完成',
  error: '错误',
};

export function NodeShell({
  label,
  kindLabel,
  colorVar,
  selected,
  status,
  hasTarget = true,
  sources = [{ id: 'out', top: '50%' }],
  children,
}: NodeShellProps) {
  return (
    <div className="node" data-status={status ?? 'idle'} data-selected={selected}>
      {hasTarget && <Handle type="target" position={Position.Left} />}

      <div className="node__head">
        <span className="node__dot" style={{ background: `var(${colorVar})` }} />
        <span className="node__kind">{kindLabel}</span>
        <span className="node__title">{label}</span>
      </div>

      <div className="node__body">
        {children}
        {status && status !== 'idle' && (
          <div className="node__status" style={{ color: `var(--st-${status})` }}>
            <span className="dot" />
            {STATUS_TEXT[status]}
          </div>
        )}
      </div>

      {sources.map((s) => (
        <Handle
          key={s.id}
          id={s.id}
          type="source"
          position={Position.Right}
          style={{ top: s.top }}
        />
      ))}
    </div>
  );
}
