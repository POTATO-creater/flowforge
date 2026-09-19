import type { WorkflowJSON } from '../types';

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

/** 读取用户选择的 .json 文件为 WorkflowJSON */
export function readWorkflowFile(file: File): Promise<WorkflowJSON> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as WorkflowJSON;
        if (data.version !== 1 || !Array.isArray(data.nodes)) {
          throw new Error('文件格式不正确');
        }
        resolve(data);
      } catch (e) {
        reject(e instanceof Error ? e : new Error('解析失败'));
      }
    };
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsText(file);
  });
}
