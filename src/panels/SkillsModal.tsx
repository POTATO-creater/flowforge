import { useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import { CloseIcon, TrashIcon, UploadIcon, PlusIcon } from '../lib/icons';

/** 解析技能文件：首行 "# 名称" 作标题，其余为正文 */
function parseSkillText(text: string, fallbackName: string): { name: string; desc: string; prompt: string } {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  let name = fallbackName;
  let body = normalized;
  const first = lines[0]?.trim() ?? '';
  if (first.startsWith('#')) {
    name = first.replace(/^#+\s*/, '').trim() || fallbackName;
    body = lines.slice(1).join('\n').trim();
  }
  // 首个非空行作为描述（最多 40 字）
  const descLine = body.split('\n').find((l) => l.trim()) ?? '';
  const desc = descLine.replace(/^[#>\-*\s]+/, '').slice(0, 40);
  return { name, desc, prompt: body };
}

export function SkillsModal({ onClose }: { onClose: () => void }) {
  const skills = useFlowStore((s) => s.skills);
  const addSkill = useFlowStore((s) => s.addSkill);
  const removeSkill = useFlowStore((s) => s.removeSkill);

  const [tab, setTab] = useState<'list' | 'paste'>('list');
  const [pasteName, setPasteName] = useState('');
  const [pasteBody, setPasteBody] = useState('');
  const [msg, setMsg] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let n = 0;
    for (const f of Array.from(files)) {
      try {
        const text = await f.text();
        const { name, desc, prompt } = parseSkillText(text, f.name.replace(/\.[^.]+$/, ''));
        if (!prompt.trim()) continue;
        addSkill({ name, desc, prompt });
        n++;
      } catch {
        /* 单个失败不阻塞其余 */
      }
    }
    setMsg(n > 0 ? `成功导入 ${n} 个技能` : '没能导入，可能是文件是空的或者读不出来');
    setTimeout(() => setMsg(''), 3000);
  };

  const savePasted = () => {
    if (!pasteBody.trim()) {
      setMsg('技能内容还空着，写点东西再保存吧');
      setTimeout(() => setMsg(''), 2500);
      return;
    }
    const { name, desc, prompt } = parseSkillText(pasteBody, pasteName.trim() || '我自己写的技能');
    addSkill({ name: pasteName.trim() || name, desc, prompt });
    setPasteName('');
    setPasteBody('');
    setTab('list');
    setMsg('存好了');
    setTimeout(() => setMsg(''), 2500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          技能
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body">
          <div className="tabs">
            <button className={`tab ${tab === 'list' ? 'is-active' : ''}`} onClick={() => setTab('list')}>
              全部（{skills.length}）
            </button>
            <button className={`tab ${tab === 'paste' ? 'is-active' : ''}`} onClick={() => setTab('paste')}>
              加新的
            </button>
          </div>

          {msg && <div className="toast-inline">{msg}</div>}

          {tab === 'list' ? (
            <div className="skill-list">
              {skills.map((s) => (
                <div className="skill-card" key={s.id}>
                  <div className="skill-card__head">
                    <span className="skill-card__name">{s.name}</span>
                    {s.builtin ? (
                      <span className="skill-card__builtin">内置</span>
                    ) : (
                      <button
                        className="btn btn--icon btn--ghost btn--tiny"
                        title="删掉这个技能"
                        onClick={() => removeSkill(s.id)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </div>
                  <div className="skill-card__desc">{s.desc || '（没写说明）'}</div>
                  <button
                    className="skill-card__toggle"
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  >
                    {expanded === s.id ? '收起来 ▲' : '看看里面写了什么 ▼'}
                  </button>
                  {expanded === s.id && <pre className="skill-card__body">{s.prompt}</pre>}
                </div>
              ))}
              <div className="field__hint">
                在画布上点中「让 AI 干活」这类节点，右边就会出现「套用一个技能」。
              </div>
            </div>
          ) : (
            <>
              <label className="dropzone">
                <UploadIcon size={20} />
                <span>点这里选文件，可以一次选好几个</span>
                <span className="field__hint">文件第一行写成「# 技能名称」，就会拿它当标题</span>
                <input
                  type="file"
                  accept=".md,.markdown,.txt,text/plain,text/markdown"
                  multiple
                  hidden
                  onChange={(e) => {
                    void importFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>

              <div className="divider-or">或者动手写一个</div>

              <div className="field">
                <span className="field__label">给它起个名字</span>
                <input
                  className="input"
                  value={pasteName}
                  placeholder="例如：帮我看合同"
                  onChange={(e) => setPasteName(e.target.value)}
                />
              </div>
              <div className="field">
                <span className="field__label">
                  具体要求写什么
                  <span className="field__hint">你在这里写的话，会变成 AI 每次都要遵守的规矩</span>
                </span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 160 }}
                  value={pasteBody}
                  placeholder={'# 帮我看合同\n\n你是一位资深法务，看合同时请重点检查…'}
                  onChange={(e) => setPasteBody(e.target.value)}
                />
              </div>
              <div className="modal__foot modal__foot--inline">
                <button className="btn btn--primary" onClick={savePasted}>
                  <PlusIcon size={14} /> 存下来
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
