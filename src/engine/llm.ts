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

/** 对话消息（含 function calling 所需的 tool 角色） */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** OpenAI tools 数组中的单个工具定义 */
export interface ToolSpec {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface LLMOptions {
  model: string;
  system?: string;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** 直接给定完整消息列表时优先使用（工具调用多轮需要） */
  messages?: ChatMessage[];
  /** function calling：可用工具 */
  tools?: ToolSpec[];
}

export interface LLMReply extends LLMResult {
  /** 模型请求调用的工具（若有） */
  toolCalls?: ToolCall[];
  /** 原始 finish_reason，用于判断是否要继续循环 */
  finishReason?: string;
}

/**
 * 调用一次 chat completion。非流式，保证日志清晰。
 * 支持 system/prompt 简写，也支持直接传 messages（工具调用用）。
 */
export async function callLLM(
  settings: ApiSettings,
  opts: LLMOptions,
  signal?: AbortSignal,
): Promise<LLMReply> {
  const base = settings.baseURL.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const model = opts.model || settings.model;
  if (!settings.apiKey) {
    throw new Error('还没填 AI 的密钥，去右上角设置里填一下（形如 sk- 开头那串）。');
  }

  const messages: ChatMessage[] =
    opts.messages ??
    [
      ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
      { role: 'user' as const, content: opts.prompt ?? '' },
    ];

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
  };
  // 工具调用场景下部分端点不接受 max_tokens，故仅在显式给出时带上
  if (opts.maxTokens != null) payload.max_tokens = opts.maxTokens;
  if (opts.tools?.length) {
    payload.tools = opts.tools;
    payload.tool_choice = 'auto';
  }

  const resp = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`;
    try {
      const err = await resp.json();
      if (err?.error?.message) detail = err.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(`问 AI 失败了：${detail}`);
  }

  const data = await resp.json();
  const choice = data?.choices?.[0];
  const msg = choice?.message;
  return {
    content: typeof msg?.content === 'string' ? msg.content : '',
    model: data?.model ?? model,
    usage: data?.usage,
    toolCalls: Array.isArray(msg?.tool_calls) ? (msg.tool_calls as ToolCall[]) : undefined,
    finishReason: choice?.finish_reason,
  };
}
