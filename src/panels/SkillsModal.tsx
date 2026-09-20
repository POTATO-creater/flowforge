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
    setMsg(n > 0 ? `已导入 ${n} 个技能` : '未导入任何技能（内容为空或读取失败）');
    setTimeout(() => setMsg(''), 3000);
  };

  const savePasted = () => {
    if (!pasteBody.trim()) {
      setMsg('技能内容不能为空');
      setTimeout(() => setMsg(''), 2500);
      return;
    }
    const { name, desc, prompt } = parseSkillText(pasteBody, pasteName.trim() || '自定义技能');
    addSkill({ name: pasteName.trim() || name, desc, prompt });
    setPasteName('');
    setPasteBody('');
    setTab('list');
    setMsg('已保存');
    setTimeout(() => setMsg(''), 2500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          技能库
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body">
          <div className="tabs">
            <button className={`tab ${tab === 'list' ? 'is-active' : ''}`} onClick={() => setTab('list')}>
              全部技能（{skills.length}）
            </button>
            <button className={`tab ${tab === 'paste' ? 'is-active' : ''}`} onClick={() => setTab('paste')}>
              导入 / 新建
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
                        title="删除技能"
                        onClick={() => removeSkill(s.id)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </div>
                  <div className="skill-card__desc">{s.desc || '（无描述）'}</div>
                  <button
                    className="skill-card__toggle"
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  >
                    {expanded === s.id ? '收起内容 ▲' : '查看内容 ▼'}
                  </button>
                  {expanded === s.id && <pre className="skill-card__body">{s.prompt}</pre>}
                </div>
              ))}
              <div className="field__hint">
                在画布上选中「大模型 / 思维链 / 工具调用 / 循环」节点，右侧面板即可把技能注入其角色设定。
              </div>
            </div>
          ) : (
            <>
              <label className="dropzone">
                <UploadIcon size={20} />
                <span>点击选择 .md / .txt 技能文件（可多选）</span>
                <span className="field__hint">首行「# 名称」会作为技能标题</span>
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

              <div className="divider-or">或者直接粘贴</div>

              <div className="field">
                <span className="field__label">技能名称</span>
                <input
                  className="input"
                  value={pasteName}
                  placeholder="例如：法律文书审阅"
                  onChange={(e) => setPasteName(e.target.value)}
                />
              </div>
              <div className="field">
                <span className="field__label">
                  技能内容
                  <span className="field__hint">这段文字会被写入节点的角色设定</span>
                </span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 160 }}
                  value={pasteBody}
                  placeholder={'# 法律文书审阅\n\n你是一位资深法务，审阅时请重点关注…'}
                  onChange={(e) => setPasteBody(e.target.value)}
                />
              </div>
              <div className="modal__foot modal__foot--inline">
                <button className="btn btn--primary" onClick={savePasted}>
                  <PlusIcon size={14} /> 保存技能
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
