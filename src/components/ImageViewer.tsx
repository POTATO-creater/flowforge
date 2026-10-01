// ============================================================
// 图片灯箱：点小图，在当前页面放大看
//
// 为什么不用「新标签打开」：图是以数据形式存的（data: 开头），
// 新版浏览器出于安全考虑【禁止】从链接跳转到这类网址 —— 表现就是
// 点了没反应。所以在页内弹一层放大看，顺便支持一键存到电脑。
// ============================================================
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ImageViewerProps {
  /** 要看的图片（可以是 http 网址，也可以是 data: 开头的数据） */
  src: string;
  /** 左上角的小标题（一般是节点名） */
  title?: string;
  onClose: () => void;
}

export function ImageViewer({ src, title, onClose }: ImageViewerProps) {
  // Esc 也能关
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="imgview" role="dialog" aria-label="查看大图" onClick={onClose}>
      <div className="imgview__bar" onClick={(e) => e.stopPropagation()}>
        <span className="imgview__title">{title || '跑出来的图'}</span>
        {/* download 属性是「存文件」而不是「跳网页」，数据图也放行 */}
        <a className="imgview__btn" href={src} download="flowforge.png">
          存到电脑
        </a>
        <button className="imgview__btn" onClick={onClose}>
          关闭（Esc）
        </button>
      </div>

      <img
        className="imgview__img"
        src={src}
        alt={title || '跑出来的图'}
        onClick={(e) => e.stopPropagation()}
      />

      <div className="imgview__hint">点空白处关闭</div>
    </div>,
    document.body,
  );
}
