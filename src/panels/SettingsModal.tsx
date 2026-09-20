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
          AI 接口设置
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>
        <div className="modal__body">
          <div className="field">
            <span className="field__label">
              服务地址
              <span className="field__hint">从你用的 AI 服务商那里复制的「接口地址」</span>
            </span>
            <input
              className="input input--mono"
              value={draft.baseURL}
              onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
            <span className="field__hint">DeepSeek、智谱、通义等都能用，填它们给的地址就行</span>
          </div>
          <div className="field">
            <span className="field__label">
              密钥
              <span className="field__hint">服务商给你的那串密码，形如 sk- 开头</span>
            </span>
            <input
              className="input input--mono"
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="sk-..."
            />
            <span className="field__hint">只存在你自己电脑的浏览器里，不会传到别处</span>
          </div>
          <div className="field">
            <span className="field__label">
              默认用哪个 AI
              <span className="field__hint">节点里不单独改的话，就用这个</span>
            </span>
            <input
              className="input input--mono"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </div>

          <div className="field">
            <span className="field__label">
              网络中转
              <span className="field__hint">有些网站不允许网页直接访问，靠它绕过</span>
            </span>
            <input
              className="input input--mono"
              value={draft.proxyURL}
              onChange={(e) => setDraft({ ...draft, proxyURL: e.target.value })}
              placeholder="留空就直连"
            />
            <span className="field__hint">
              访问网址、读网页、读订阅这类节点，会先试着直接访问；被网站拦住时，自动改用这里填的地址绕过去。留空就是完全不中转。
            </span>
          </div>
        </div>
        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>
            算了
          </button>
          <button className="btn btn--primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
