import { useMemo, useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import { buildShareUrl } from '../lib/share';

export function ShareModal({ onClose }: { onClose: () => void }) {
  const serialize = useFlowStore((s) => s.serialize);
  const workflowName = useFlowStore((s) => s.workflowName);
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => buildShareUrl(serialize()), [serialize]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 复制失败就让用户在框里手动选 */
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          分享这个工作流
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal__body">
          <p className="inspector__plain">
            下面这条链接里已经打包好了整个「{workflowName}」。发给别人，他用浏览器打开，应用会问要不要直接载入。
          </p>
          <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
        </div>
        <div className="modal__foot">
          <button className="btn" onClick={onClose}>
            关掉
          </button>
          <button className="btn btn--primary" onClick={copy}>
            {copied ? '已复制' : '复制链接'}
          </button>
        </div>
      </div>
    </div>
  );
}
