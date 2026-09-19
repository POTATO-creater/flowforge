import { useFlowStore } from '../store/flowStore';
import type { LogEntry } from '../engine/execute';

export function LogsPanel({ logs }: { logs: LogEntry[] }) {
  const selected = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const run = selected?.data.run;

  return (
    <div className="logs">
      <div className="logs__head">
        运行日志
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{logs.length} 条</span>
      </div>
      <div className="logs__body">
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>点击「运行」后，这里会显示每个节点的执行过程。</div>
        ) : (
          logs.map((l, i) => (
            <div className="log-row" key={i}>
              <span className="log-row__time">{l.t}</span>
              <span className={`log-row__tag ${l.tag}`}>{l.tag === 'run' ? 'RUN' : l.tag === 'ok' ? 'OK' : l.tag === 'err' ? 'ERR' : 'INFO'}</span>
              <span className="log-row__msg">{l.msg}</span>
            </div>
          ))
        )}
      </div>
      {run && (
        <div className="logs__detail">
          <h4>{selected?.data.label} · 输入 / 输出</h4>
          <pre>{run.error ? `错误：${run.error}` : JSON.stringify({ input: run.input, output: run.output }, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
