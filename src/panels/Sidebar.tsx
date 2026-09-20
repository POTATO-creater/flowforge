import { useMemo, useState } from 'react';
import { NODE_LIST, NODE_GROUPS } from '../nodeMeta';
import type { NodeKind } from '../types';
import { useFlowStore } from '../store/flowStore';

export const DND_MIME = 'application/flowforge-node';

/** localStorage 里记住「哪些分组被收起来了」，下次打开还是老样子 */
const COLLAPSE_KEY = 'flowforge.collapsedGroups';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* 读不出来就当全展开 */
  }
  return new Set();
}

export function Sidebar() {
  const mode = useFlowStore((s) => s.mode);
  const [keyword, setKeyword] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* 存不进去也不影响用 */
      }
      return next;
    });
  }

  // 搜索：按名字、大白话说明、还有分组标题一起找，全都匹配得上
  const q = keyword.trim().toLowerCase();
  const searching = q.length > 0;

  const groups = useMemo(() => {
    return NODE_GROUPS.map((g) => {
      const all = NODE_LIST.filter((m) => m.group === g.key);
      const items = searching
        ? all.filter((m) =>
            [m.name, m.plain, m.desc, g.title].some((s) => (s ?? '').toLowerCase().includes(q)),
          )
        : all;
      return { ...g, items, total: all.length };
    }).filter((g) => g.items.length > 0);
  }, [q, searching]);

  const hitCount = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <aside className="sidebar">
      {/* 搜索框：节点多了以后，靠翻列表找太慢 */}
      <div className="sidebar__search">
        <span className="sidebar__search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          className="sidebar__search-input"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="找节点…（试试「图」「密码」「翻译」）"
          aria-label="搜索节点"
        />
        {searching && (
          <button
            className="sidebar__search-clear"
            onClick={() => setKeyword('')}
            title="清空"
            aria-label="清空搜索"
          >
            ×
          </button>
        )}
      </div>

      {searching && (
        <div className="sidebar__count">
          {hitCount > 0 ? `找到 ${hitCount} 个` : '没找到，换个词试试'}
        </div>
      )}

      {groups.map((g) => {
        // 搜索时强制展开，不然搜到了却看不见
        const isOpen = searching || !collapsed.has(g.key);
        return (
          <div className="sidebar__section" key={g.key}>
            <button
              className={`sidebar__title sidebar__title--btn${isOpen ? ' is-open' : ''}`}
              onClick={() => toggleGroup(g.key)}
              aria-expanded={isOpen}
              disabled={searching}
            >
              <span className={`sidebar__chev${isOpen ? ' is-open' : ''}`} aria-hidden="true">
                ▸
              </span>
              <span>{g.title}</span>
              <span className="sidebar__count-badge">{g.items.length}</span>
            </button>

            {isOpen && (
              <div className="palette">
                {g.items.map((m) => (
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
                      window.dispatchEvent(
                        new CustomEvent('flowforge:add', { detail: m.kind as NodeKind }),
                      );
                    }}
                    title={mode === 'basic' ? m.plain : m.desc}
                  >
                    <span className="palette__badge" style={{ background: `var(${m.colorVar})` }}>
                      {m.badge}
                    </span>
                    <div className="palette__meta">
                      <div className="palette__name">
                        {m.name}
                        {m.needsProxy && <span className="palette__flag">需要中转</span>}
                      </div>
                      <div className="palette__desc">{mode === 'basic' ? m.plain : m.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="sidebar__hint">
        把左边的方块拖到画布上，就有了一个节点。双击也能加。
        <br />
        <br />
        想连线，就从节点右边的小圆点拖到下一个节点左边的小圆点。连上之后，下一步的表达框会自动带上它的结果。
      </div>
    </aside>
  );
}
