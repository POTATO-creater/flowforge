import { toPng } from 'html-to-image';
import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';

/** 把当前画布导出为 PNG（使用 html-to-image，套用暗色背景） */
export async function exportCanvasPng(nodes: Node[]) {
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewport || nodes.length === 0) return;

  const bounds = getNodesBounds(nodes);
  const padding = 0.2;
  const width = Math.max(800, Math.round(bounds.width + 80));
  const height = Math.max(600, Math.round(bounds.height + 80));
  const transform = getViewportForBounds(bounds, width, height, 0.3, 2, padding);

  const dataUrl = await toPng(viewport, {
    backgroundColor: '#0e1116',
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
