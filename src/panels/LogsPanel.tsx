import { useFlowStore } from '../store/flowStore';
import type { LogEntry } from '../engine/execute';

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
          <h4>{selected?.data.label} · 收到了什么 / 产出了什么</h4>
          <pre>
            {run.error
              ? `出错了：${run.error}`
              : JSON.stringify({ 收到: run.input, 产出: run.output }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
