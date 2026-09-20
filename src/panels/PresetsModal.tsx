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
          现成的例子
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body">
          {target ? (
            <div className="confirm">
              <div className="confirm__title">换成「{target.name}」，画布上原有的东西就没了</div>
              <p className="confirm__desc">
                现在画布上有 {nodeCount} 个节点，换过去会全部替换掉，而且没法撤回。
                <br />
                想留着的话，先点工具栏的「存下来」备份一份。
              </p>
              <div className="confirm__btns">
                <button className="btn" onClick={() => setConfirmId(null)}>
                  算了
                </button>
                <button className="btn btn--primary" onClick={() => doLoad(target.id)}>
                  换掉，开始用
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
                      {t.needsKey && <span className="tpl-card__badge">要先填密钥</span>}
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
                    <span className="tpl-card__cta">就用这个 →</span>
                  </button>
                ))}
              </div>
              <div className="field__hint">
                挑一个直接用就行，里面的内容都可以随手改。
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
