// ============================================================
// HTTP 工具节点：真实发起 fetch 请求
//
// 所有外部访问统一走 lib/net.ts 的 fetchSmart，
// 由它负责「直连失败就自动改走中转」以及把跨域错误翻成人话。
// ============================================================
import type { ToolConfig } from '../types';
import { interpolate } from './vars';
import type { VarContext } from './vars';
import { fetchSmart, type CorsMode } from '../lib/net';

export interface ToolResult {
  status: number;
  body: string;
  json?: unknown; // 若响应为合法 JSON 则解析
  /** 是否走了中转 */
  viaProxy?: boolean;
  /** 走了中转的原因说明 */
  note?: string;
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
  proxy?: string,
  cors: CorsMode = 'either',
): Promise<ToolResult> {
  const r = await fetchSmart({ url, method, headers, body, signal, cors }, proxy);
  if (r.status >= 400) {
    throw new Error(`对方返回了错误：${r.status}。地址：${url}`);
  }
  return { status: r.status, body: r.text, json: r.json, viaProxy: r.viaProxy, note: r.note };
}

export async function callTool(
  cfg: ToolConfig,
  ctx: VarContext,
  signal?: AbortSignal,
  proxy?: string,
): Promise<ToolResult> {
  const url = interpolate(cfg.url, ctx);
  if (!url) throw new Error('这个节点还没填要访问的网址。');

  const headers = parseHeaders(interpolate(cfg.headers, ctx));
  let body: string | undefined;
  if (cfg.method !== 'GET' && cfg.method !== 'DELETE' && cfg.body.trim()) {
    body = interpolate(cfg.body, ctx);
  }
  return requestRaw(url, cfg.method, headers, body, signal, proxy);
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
  viaProxy?: boolean;
  note?: string;
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
  opts: {
    url: string;
    proxy: string;
    extract: 'markdown' | 'text' | 'raw';
    headers: string;
    timeout: number;
    /** 用户设置的全局中转地址 */
    netProxy?: string;
    cors?: CorsMode;
  },
  ctx: VarContext,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const target = interpolate(opts.url, ctx).trim();
  if (!target) throw new Error('这个节点还没填要读的网址。');

  const proxy = interpolate(opts.proxy, ctx).trim();
  // 节点自己填了代理就直接用；否则交给 fetchSmart 按全局中转设置处理
  const cors: CorsMode = opts.cors ?? (proxy ? 'proxy' : 'either');
  const headers = parseHeaders(interpolate(opts.headers, ctx));

  const r = await fetchSmart(
    {
      url: target,
      method: 'GET',
      headers,
      timeout: Math.max(5, Number(opts.timeout) || 30),
      signal,
      cors,
    },
    proxy || opts.netProxy,
  );

  if (r.status >= 400) {
    throw new Error(`没能读到这个网页：${r.status}。地址：${target}`);
  }
  const raw = r.text;
  const content = opts.extract === 'raw' ? raw : opts.extract === 'text' ? stripHtml(raw) : raw;
  return {
    title: pickTitle(raw),
    content,
    url: target,
    status: r.status,
    viaProxy: r.viaProxy,
    note: r.note,
  };
}
