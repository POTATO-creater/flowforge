import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import type { RunStatus, RunInfo } from '../types';
import { readableOutput, clip } from '../lib/preview';

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
  /** 该节点本次运行的信息，用于在卡片上直接显示结果 */
  run?: RunInfo;
  hasTarget?: boolean;
  sources?: SourceHandleDef[];
  children?: ReactNode;
}

export function NodeShell({
  label,
  kindLabel,
  colorVar,
  selected,
  status,
  run,
  hasTarget = true,
  sources = [{ id: 'out', top: '50%' }],
  children,
}: NodeShellProps) {
  const st = status ?? 'idle';
  const result = run?.status === 'success' ? readableOutput(run.output) : '';
  const { text: shown, clipped } = clip(result, 160);
  const chars = result.length;

  return (
    <div className="node" data-status={st} data-selected={selected}>
      {hasTarget && <Handle type="target" position={Position.Left} />}

      <div className="node__head">
        <span className="node__dot" style={{ background: `var(${colorVar})` }} />
        <span className="node__kind">{kindLabel}</span>
        <span className="node__title">{label}</span>
      </div>

      <div className="node__body">
        {children}

        {/* 跑完之后，结果直接显示在卡片上，不用再去别处翻 */}
        {run && run.status !== 'idle' && (
          <div className="node__result" data-state={run.status}>
            <div className="node__result-head">
              <span className="node__result-label">
                {run.status === 'running' && '正在跑…'}
                {run.status === 'success' && '跑好了'}
                {run.status === 'error' && '没跑通'}
              </span>
              {run.status === 'success' && typeof run.durationMs === 'number' && (
                <span className="node__result-meta">
                  {chars > 0 ? `${chars} 个字 · ` : ''}
                  {run.durationMs} 毫秒
                </span>
              )}
            </div>

            {run.status === 'success' && shown && (
              <div className="node__result-text">
                {shown}
                {clipped && <span className="node__result-more">…（还有更多，点开右侧看全文）</span>}
              </div>
            )}
            {run.status === 'success' && !shown && (
              <div className="node__result-text node__result-text--empty">（这次没有产出内容）</div>
            )}

            {run.status === 'error' && (
              <div className="node__result-text node__result-text--error">{run.error}</div>
            )}

            {run.status === 'running' && <div className="node__result-bar" />}
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
