import type { WorkflowJSON } from '../types';

/** UTF-8 安全的 base64 编码 */
function toB64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/** UTF-8 安全的 base64 解码 */
function fromB64(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 把整张工作流压成一段可以塞进网址的字符串 */
export function encodeWorkflow(wf: WorkflowJSON): string {
  return toB64(JSON.stringify(wf));
}

/** 从网址里的字符串还原工作流；解析失败返回 null */
export function decodeWorkflow(b64: string): WorkflowJSON | null {
  try {
    const json = fromB64(b64);
    const wf = JSON.parse(json) as WorkflowJSON;
    if (wf && typeof wf === 'object' && Array.isArray(wf.nodes)) return wf;
  } catch {
    /* 串不对就当没有 */
  }
  return null;
}

/** 生成一条可以直接发给别人的分享链接（工作流编码进网址） */
export function buildShareUrl(wf: WorkflowJSON): string {
  const base = location.href.split('#')[0];
  return `${base}#wf=${encodeWorkflow(wf)}`;
}

/** 从当前网址里取出别人分享的工作流（如果有） */
export function readShareFromUrl(): WorkflowJSON | null {
  const m = location.hash.match(/[#&]wf=([^&]+)/);
  if (!m) return null;
  return decodeWorkflow(m[1]);
}
