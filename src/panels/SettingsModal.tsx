import { useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import type { ApiSettings } from '../types';
import { CloseIcon } from '../lib/icons';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useFlowStore((s) => s.settings);
  const saveSettings = useFlowStore((s) => s.saveSettings);
  const [draft, setDraft] = useState<ApiSettings>(settings);

  const save = () => {
    saveSettings(draft);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          API 设置
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>
        <div className="modal__body">
          <div className="field">
            <span className="field__label">API Base URL</span>
            <input
              className="input input--mono"
              value={draft.baseURL}
              onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
            <span className="field__hint">OpenAI 兼容端点，如 DeepSeek / GLM / 通义均适用</span>
          </div>
          <div className="field">
            <span className="field__label">API Key</span>
            <input
              className="input input--mono"
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="sk-..."
            />
            <span className="field__hint">仅保存在本机浏览器 localStorage，不会上传</span>
          </div>
          <div className="field">
            <span className="field__label">默认模型</span>
            <input
              className="input input--mono"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </div>
        </div>
        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn--primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
