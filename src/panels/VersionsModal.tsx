import { useFlowStore } from '../store/flowStore';

export function VersionsModal({ onClose }: { onClose: () => void }) {
  const versions = useFlowStore((s) => s.versions);
  const saveVersion = useFlowStore((s) => s.saveVersion);
  const restoreVersion = useFlowStore((s) => s.restoreVersion);
  const deleteVersion = useFlowStore((s) => s.deleteVersion);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          版本历史
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal__body">
          <p className="inspector__plain">
            手动存下的检查点都在这里。恢复到某个版本会覆盖当前画布（可以用 Ctrl/⌘+Z 撤销）。
          </p>
          <button
            className="btn btn--primary"
            onClick={() => {
              const name = window.prompt('给这个版本起个名字（留空用时间）：');
              saveVersion(name ?? undefined);
            }}
          >
            存当前为版本
          </button>

          {versions.length === 0 ? (
            <p className="sidebar__hint">还没有存过版本。改完重要的东西，点上面的「存当前为版本」。</p>
          ) : (
            <div className="skill-list">
              {versions
                .slice()
                .reverse()
                .map((v) => (
                  <div className="skill-card" key={v.id}>
                    <div className="skill-card__head">
                      <span className="skill-card__name">{v.name}</span>
                      <span className="skill-card__builtin">
                        {v.nodes.length} 节点 · {new Date(v.time).toLocaleString('zh-CN', { hour12: false })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="btn" onClick={() => { restoreVersion(v.id); onClose(); }}>
                        恢复这一版
                      </button>
                      <button
                        className="btn btn--icon btn--danger"
                        onClick={() => deleteVersion(v.id)}
                        title="删除这个版本"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
        <div className="modal__foot">
          <button className="btn" onClick={onClose}>
            关掉
          </button>
        </div>
      </div>
    </div>
  );
}
