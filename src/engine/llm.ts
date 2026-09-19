// ============================================================
// LLM 客户端：OpenAI 兼容 /chat/completions
// 直连用户配置的 baseURL（存于 localStorage），支持主流兼容端点
// ============================================================
import type { ApiSettings } from '../types';

export interface LLMResult {
  content: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/**
 * 调用一次 chat completion。非流式，保证日志清晰。
 */
export async function callLLM(
  settings: ApiSettings,
  opts: { model: string; system: string; prompt: string; temperature: number; maxTokens: number },
  signal?: AbortSignal,
): Promise<LLMResult> {
  const base = settings.baseURL.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const model = opts.model || settings.model;
  if (!settings.apiKey) {
    throw new Error('未配置 API Key，请先在「设置」中填写');
  }
  const resp = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
        { role: 'user', content: opts.prompt },
      ],
    }),
  });

  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`;
    try {
      const err = await resp.json();
      if (err?.error?.message) detail = err.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(`模型请求失败：${detail}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  return {
    content,
    model: data?.model ?? model,
    usage: data?.usage,
  };
}
