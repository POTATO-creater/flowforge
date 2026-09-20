// ============================================================
// HTTP 工具节点：真实发起 fetch 请求
// ============================================================
import type { ToolConfig } from '../types';
import { interpolate } from './vars';
import type { VarContext } from './vars';

export interface ToolResult {
  status: number;
  body: string;
  json?: unknown; // 若响应为合法 JSON 则解析
}

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/** 直接按 url/method 发起请求（供工具调用节点复用） */
export async function requestRaw(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  headers: Record<string, string> = {},
  body?: string,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const resp = await fetch(url, { method, headers, body, signal });
  const text = await resp.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: resp.status, body: text, json };
}

export async function callTool(
  cfg: ToolConfig,
  ctx: VarContext,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const url = interpolate(cfg.url, ctx);
  if (!url) throw new Error('这个节点还没填要访问的网址。');

  const headers = parseHeaders(interpolate(cfg.headers, ctx));
  let body: string | undefined;
  if (cfg.method !== 'GET' && cfg.method !== 'DELETE' && cfg.body.trim()) {
    body = interpolate(cfg.body, ctx);
  }
  return requestRaw(url, cfg.method, headers, body, signal);
}

// ============================================================
// 网页抓取：浏览器直连第三方站点会被 CORS 拦截，
// 故默认经只读文本代理（r.jina.ai）取回正文。
// ============================================================

export interface FetchResult {
  title: string;
  content: string;
  url: string;
  status: number;
}

/** 去 HTML 标签，压掉多余空白 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 从 Markdown 正文里提取首个一级标题作 title */
function pickTitle(md: string): string {
  const m = md.match(/^\s*Title:\s*(.+)$/m) || md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

export async function fetchPage(
  opts: { url: string; proxy: string; extract: 'markdown' | 'text' | 'raw'; headers: string; timeout: number },
  ctx: VarContext,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const target = interpolate(opts.url, ctx).trim();
  if (!target) throw new Error('这个节点还没填要读的网址。');

  const proxy = interpolate(opts.proxy, ctx).trim();
  // proxy 为空则直连（仅在同源或对方开放 CORS 时可行）
  const endpoint = proxy ? `${proxy.replace(/\/+$/, '')}/${target}` : target;

  const headers = parseHeaders(interpolate(opts.headers, ctx));

  const timeoutMs = Math.max(5, Number(opts.timeout) || 30) * 1000;
  const timer = new AbortController();
  const onAbort = () => timer.abort();
  signal?.addEventListener('abort', onAbort);
  const to = setTimeout(() => timer.abort(), timeoutMs);

  try {
    const resp = await fetch(endpoint, {
      method: 'GET',
      headers,
      signal: timer.signal,
    });
    const raw = await resp.text();
    if (!resp.ok) {
      throw new Error(`没能读到这个网页：${resp.status} ${resp.statusText}`);
    }
    const content = opts.extract === 'raw' ? raw : opts.extract === 'text' ? stripHtml(raw) : raw;
    return {
      title: pickTitle(raw),
      content,
      url: target,
      status: resp.status,
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`等太久了（超过 ${opts.timeout} 秒）还没读到：${target}`);
    }
    throw e;
  } finally {
    clearTimeout(to);
    signal?.removeEventListener('abort', onAbort);
  }
}
