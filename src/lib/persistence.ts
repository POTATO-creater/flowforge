import type { WorkflowJSON } from '../types';
import { NODE_METAS } from '../nodeMeta';

/** 下载工作流为 .json 文件 */
export function downloadWorkflowJSON(wf: WorkflowJSON) {
  const blob = new Blob([JSON.stringify(wf, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${wf.name || 'workflow'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 读取用户选择的 .json 文件为 WorkflowJSON。
 * 校验刻意宽松：只要含 nodes 数组即可，缺失字段由 store 用默认值补齐，
 * 这样外部手写的模板文件也能直接导入。
 */
export function readWorkflowFile(file: File): Promise<WorkflowJSON> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Partial<WorkflowJSON>;
        if (!data || !Array.isArray(data.nodes) || data.nodes.length === 0) {
          throw new Error('文件里没有 nodes 节点数组');
        }
        // 逐节点校验 kind 合法性，给出精确报错而不是运行时报错
        const bad = data.nodes.find((n) => !n || !(n.kind in NODE_METAS));
        if (bad) {
          throw new Error(
            `存在未知节点类型「${String((bad as { kind?: unknown }).kind)}」，可用类型：${Object.keys(NODE_METAS).join(' / ')}`,
          );
        }
        resolve({
          version: 1,
          name: typeof data.name === 'string' && data.name ? data.name : file.name.replace(/\.json$/i, ''),
          description: data.description,
          nodes: data.nodes.map((n) => ({
            id: n.id || `${n.kind}_${Math.random().toString(36).slice(2, 8)}`,
            kind: n.kind,
            label: n.label || NODE_METAS[n.kind].name,
            position: n.position ?? { x: 0, y: 0 },
            config: n.config ?? {},
          })),
          edges: Array.isArray(data.edges) ? data.edges.filter((e) => e && e.source && e.target) : [],
        });
      } catch (e) {
        reject(e instanceof Error ? e : new Error('解析失败'));
      }
    };
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsText(file);
  });
}
