import { NODE_LIST } from '../nodeMeta';
import type { NodeKind } from '../types';

export const DND_MIME = 'application/flowforge-node';

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__title">节点库</div>
      <div className="palette">
        {NODE_LIST.map((m) => (
          <div
            key={m.kind}
            className="palette__item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_MIME, m.kind);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDoubleClick={() => {
              // 双击在画布中心附近落点（由 App 处理坐标）
              window.dispatchEvent(new CustomEvent('flowforge:add', { detail: m.kind as NodeKind }));
            }}
            title="拖到画布添加，或双击添加"
          >
            <span className="palette__badge" style={{ background: `var(${m.colorVar})` }}>
              {m.badge}
            </span>
            <div className="palette__meta">
              <div className="palette__name">{m.name}</div>
              <div className="palette__desc">{m.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="sidebar__hint">
        拖拽节点到画布即可添加；连线时从右侧圆点拖到目标节点左侧圆点。变量用
        <span className="varhint">{'{{节点ID.字段}}'}</span> 引用上游结果。
      </div>
    </aside>
  );
}
