import { NODE_LIST, NODE_GROUPS } from '../nodeMeta';
import type { NodeKind } from '../types';
import { useFlowStore } from '../store/flowStore';

export const DND_MIME = 'application/flowforge-node';

export function Sidebar() {
  const mode = useFlowStore((s) => s.mode);

  return (
    <aside className="sidebar">
      {NODE_GROUPS.map((g) => {
        const items = NODE_LIST.filter((m) => m.group === g.key);
        if (items.length === 0) return null;
        return (
          <div className="sidebar__section" key={g.key}>
            <div className="sidebar__title">{g.title}</div>
            <div className="palette">
              {items.map((m) => (
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
                  title={mode === 'basic' ? m.plain : m.desc}
                >
                  <span className="palette__badge" style={{ background: `var(${m.colorVar})` }}>
                    {m.badge}
                  </span>
                  <div className="palette__meta">
                    <div className="palette__name">{m.name}</div>
                    <div className="palette__desc">{mode === 'basic' ? m.plain : m.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="sidebar__hint">
        拖拽节点到画布即可添加，双击也行。连线时从右侧圆点拖到目标节点左侧圆点。
        <br />
        <br />
        变量用
        <span className="varhint">{'{{节点ID.字段}}'}</span>引用上游结果。
      </div>
    </aside>
  );
}
