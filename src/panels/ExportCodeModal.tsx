import { useMemo, useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import { generateJS } from '../lib/generateCode';

export function ExportCodeModal({ onClose }: { onClose: () => void }) {
  const serialize = useFlowStore((s) => s.serialize);
  const settings = useFlowStore((s) => s.settings);
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => generateJS(serialize(), settings), [serialize, settings]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const download = () => {
    const blob = new Blob([code], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(serialize().name || 'workflow').replace(/\s+/g, '_')}.mjs`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          导出成代码
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal__body">
          <p className="inspector__plain">
            下面是一份能直接跑的 JavaScript（Node 18+）。AI / 联网节点走 fetch，本地节点直接算。带好自己的密钥再跑。
          </p>
          <pre
            className="logs__detail"
            style={{ maxHeight: '52vh', whiteSpace: 'pre', fontSize: 11 }}
          >
            {code}
          </pre>
        </div>
        <div className="modal__foot">
          <button className="btn" onClick={onClose}>
            关掉
          </button>
          <button className="btn" onClick={download}>
            下载 .mjs
          </button>
          <button className="btn btn--primary" onClick={copy}>
            {copied ? '已复制' : '复制代码'}
          </button>
        </div>
      </div>
    </div>
  );
}
