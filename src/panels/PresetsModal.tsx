import { useState } from 'react';
import { TEMPLATES } from '../presets/templates';
import { NODE_METAS } from '../nodeMeta';
import { useFlowStore } from '../store/flowStore';
import { CloseIcon } from '../lib/icons';
import type { NodeKind } from '../types';

export function PresetsModal({ onClose }: { onClose: () => void }) {
  const loadWorkflowJSON = useFlowStore((s) => s.loadWorkflowJSON);
  const nodeCount = useFlowStore((s) => s.nodes.length);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const doLoad = (id: string) => {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    // 深拷贝，避免后续编辑污染模板常量
    const cloned = JSON.parse(JSON.stringify(tpl.workflow));
    loadWorkflowJSON(cloned, tpl.name);
    onClose();
  };

  const onPick = (id: string) => {
    if (nodeCount > 0) setConfirmId(id);
    else doLoad(id);
  };

  const target = confirmId ? TEMPLATES.find((t) => t.id === confirmId) : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          选择模板
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body">
          {target ? (
            <div className="confirm">
              <div className="confirm__title">载入「{target.name}」将覆盖当前画布</div>
              <p className="confirm__desc">
                当前画布上有 {nodeCount} 个节点，载入模板会全部替换。此操作不可撤销。
                <br />
                如需保留，请先「导出」备份。
              </p>
              <div className="confirm__btns">
                <button className="btn" onClick={() => setConfirmId(null)}>
                  取消
                </button>
                <button className="btn btn--primary" onClick={() => doLoad(target.id)}>
                  覆盖并载入
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="gallery">
                {TEMPLATES.map((t) => (
                  <button key={t.id} className="tpl-card" onClick={() => onPick(t.id)}>
                    <div className="tpl-card__head">
                      <span className="tpl-card__name">{t.name}</span>
                      {t.needsKey && <span className="tpl-card__badge">需 API Key</span>}
                    </div>
                    <p className="tpl-card__desc">{t.desc}</p>
                    <div className="tpl-card__badges">
                      {dedupe(t.kinds).map((k) => {
                        const meta = NODE_METAS[k as NodeKind];
                        if (!meta) return null;
                        return (
                          <span
                            key={k}
                            className="tpl-card__node"
                            style={{ borderColor: `var(${meta.colorVar})`, color: `var(${meta.colorVar})` }}
                          >
                            {meta.name}
                          </span>
                        );
                      })}
                    </div>
                    <span className="tpl-card__cta">载入此模板 →</span>
                  </button>
                ))}
              </div>
              <div className="field__hint">
                也可以从外部导入模板：点工具栏「导入」选择符合格式的 .json 文件。
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list));
}
