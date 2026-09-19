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

export async function callTool(
  cfg: ToolConfig,
  ctx: VarContext,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const url = interpolate(cfg.url, ctx);
  if (!url) throw new Error('工具节点未配置 URL');

  const headers = parseHeaders(interpolate(cfg.headers, ctx));
  let body: string | undefined;
  if (cfg.method !== 'GET' && cfg.method !== 'DELETE' && cfg.body.trim()) {
    body = interpolate(cfg.body, ctx);
  }

  const resp = await fetch(url, {
    method: cfg.method,
    headers,
    body,
    signal,
  });

  const text = await resp.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: resp.status, body: text, json };
}
