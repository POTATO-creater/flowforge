import { useFlowStore } from '../store/flowStore';
import type { LogEntry } from '../engine/execute';
import { readableOutput } from '../lib/preview';

export function LogsPanel({ logs }: { logs: LogEntry[] }) {
  const selected = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const run = selected?.data.run;

  return (
    <div className="logs">
      <div className="logs__head">
        运行记录
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{logs.length} 条</span>
      </div>
      <div className="logs__body">
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>
            点上面的「跑一遍」，这里会一步步显示每个节点做了什么。
          </div>
        ) : (
          logs.map((l, i) => (
            <div className="log-row" key={i}>
              <span className="log-row__time">{l.t}</span>
              <span className={`log-row__tag ${l.tag}`}>
                {l.tag === 'run' ? '开始' : l.tag === 'ok' ? '完成' : l.tag === 'err' ? '出错' : '提示'}
              </span>
              <span className="log-row__msg">{l.msg}</span>
            </div>
          ))
        )}
      </div>
      {run && (
        <div className="logs__detail">
          <h4>{selected?.data.label} · 结果</h4>
          {run.error ? (
            <div className="logs__detail-err">没跑通：{run.error}</div>
          ) : (
            <pre>{readableOutput(run.output) || '（没有产出内容）'}</pre>
          )}
        </div>
      )}
    </div>
  );
}
