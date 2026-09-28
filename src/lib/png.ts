import { toPng } from 'html-to-image';
import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';

/**
 * 读当前生效的画布底色。
 *
 * 必须用 getComputedStyle 取真实值，不能直接传 `var(--bg-canvas)`：
 * html-to-image 是把颜色画进 canvas 的，canvas 不认 CSS 变量。
 */
function currentCanvasBg(): string {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg-canvas')
      .trim();
    if (v) return v;
  } catch {
    /* ignore */
  }
  return '#ffffff';
}

/** 把当前画布导出为 PNG（背景跟随当前亮/暗主题） */
export async function exportCanvasPng(nodes: Node[]) {
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewport || nodes.length === 0) return;

  const bounds = getNodesBounds(nodes);
  const padding = 0.2;
  const width = Math.max(800, Math.round(bounds.width + 80));
  const height = Math.max(600, Math.round(bounds.height + 80));
  const transform = getViewportForBounds(bounds, width, height, 0.3, 2, padding);

  const dataUrl = await toPng(viewport, {
    backgroundColor: currentCanvasBg(),
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
    },
  });

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'flowforge-workflow.png';
  a.click();
}
