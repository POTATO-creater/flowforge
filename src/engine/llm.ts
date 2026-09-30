// ============================================================
// LLM 客户端：OpenAI 兼容 /chat/completions
// 直连用户配置的 baseURL（存于 localStorage），支持主流兼容端点
// ============================================================
import type { ApiSettings } from '../types';
import { isCorsLike } from '../lib/net';
import { readSSE } from '../lib/sse';

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
  /** 模型的「思考」过程（部分模型才有；流式模式下收集得到） */
  reasoning?: string;
}

/**
 * 发这次 AI 请求。直连被浏览器拦了就自动改用中转再试一次。
 *
 * 为什么不复用 net.ts 的 fetchSmart：那个是给「读网页」类节点用的，
 * 走的是 r.jina.ai 那种「把网页转成文字」的只读代理，会把 POST 的 body
 * 丢掉，AI 请求靠它发不出去。所以这里单独做一层，只借用它的跨域判断。
 */
async function sendWithFallback(
  url: string,
  init: RequestInit,
  proxyURL: string | undefined,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    const proxy = (proxyURL ?? '').trim();
    // 不是跨域问题（比如用户主动取消）就原样抛出，不要瞎试
    if (!isCorsLike(e) || !proxy) {
      throw explainLLMNetworkError(e, url, !!proxy);
    }
    const base = proxy.endsWith('/') ? proxy : `${proxy}/`;
    try {
      return await fetch(base + url, init);
    } catch (e2) {
      throw explainLLMNetworkError(e2, url, true);
    }
  }
}

/** 把 AI 请求的网络异常翻成人话 */
function explainLLMNetworkError(e: unknown, url: string, hadProxy: boolean): Error {
  if (e instanceof Error && e.name === 'AbortError') {
    return new Error('等 AI 回复等太久了。要么对方太慢，要么服务地址填得不对。');
  }
  if (isCorsLike(e)) {
    return new Error(
      hadProxy
        ? `连中转也没能连上这个 AI 服务：${url}。\n检查一下设置里的「网络中转」地址填得对不对。`
        : `这个 AI 服务不允许网页直接访问（浏览器的安全规则）。\n去设置里的「网络中转」填一个中转地址再试。`,
    );
  }
  if (e instanceof Error) return e;
  return new Error(`连接 AI 服务时出了点问题：${String(e)}`);
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
    throw new Error('自带的免费 AI 没接上（多半是网络问题）。检查一下网络，或者从设置里换成自己的 AI。');
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

  const resp = await sendWithFallback(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(payload),
  }, settings.proxyURL);

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

// ============================================================
// 流式版：让 AI 一字一句往外蹦，而不是憋到最后一口气说完
// ============================================================

/** 流式回答的回调。onDelta 每来一小段正文就调一次 */
export interface StreamHandlers {
  onDelta: (text: string) => void;
  /** 有些模型会先「思考」再回答，思考内容从这里出（可有可无） */
  onReasoning?: (text: string) => void;
}

/**
 * 流式调用一次 chat completion。
 *
 * 和 callLLM 的关系：
 *   - 请求只差一个开关（stream: true）；
 *   - 回复从「一整块」变成「一小段一小段」，每段经 onDelta 推给界面；
 *   - 最终仍然返回和 callLLM 完全一样形状的结果，上层调用点零改动切换。
 *
 * 兜底：个别服务不支持流式（回复不是推流格式），这时自动退回
 * 「等整块回来再一次性推出」，调用方无感。
 */
export async function callLLMStream(
  settings: ApiSettings,
  opts: LLMOptions,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<LLMReply> {
  const base = settings.baseURL.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const model = opts.model || settings.model;
  if (!settings.apiKey) {
    throw new Error('自带的免费 AI 没接上（多半是网络问题）。检查一下网络，或者从设置里换成自己的 AI。');
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
    stream: true,
  };
  if (opts.maxTokens != null) payload.max_tokens = opts.maxTokens;
  if (opts.tools?.length) {
    payload.tools = opts.tools;
    payload.tool_choice = 'auto';
  }

  const resp = await sendWithFallback(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(payload),
  }, settings.proxyURL);

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

  // 对方不支持流式（没按推流格式回）：按一次性回复处理，无感降级
  const ctype = resp.headers.get('content-type') ?? '';
  if (!ctype.includes('event-stream')) {
    const data = await resp.json();
    const choice = data?.choices?.[0];
    const msg = choice?.message;
    const content = typeof msg?.content === 'string' ? msg.content : '';
    if (content) handlers.onDelta(content);
    return {
      content,
      model: data?.model ?? model,
      usage: data?.usage,
      toolCalls: Array.isArray(msg?.tool_calls) ? (msg.tool_calls as ToolCall[]) : undefined,
      finishReason: choice?.finish_reason,
    };
  }

  if (!resp.body) {
    throw new Error('这个浏览器不支持一字一句地接收回答，换个新版浏览器再试。');
  }

  // —— 逐帧拼接 ——
  // 正文、思考、工具调用都是「碎片」：内容是增量拼的，
  // 工具调用的参数尤其碎（一个 JSON 会拆成好多段），要按编号对齐着接。
  let content = '';
  let reasoning = '';
  let finishReason: string | undefined;
  let usage: LLMReply['usage'];
  let replyModel = model;
  const toolParts = new Map<number, { id: string; name: string; arguments: string }>();

  const applyChunk = (json: {
    model?: string;
    usage?: LLMReply['usage'];
    choices?: Array<{
      delta?: {
        content?: string | null;
        reasoning_content?: string | null;
        reasoning?: string | null;
        tool_calls?: Array<{
          index?: number;
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
      finish_reason?: string | null;
    }>;
  }) => {
    if (typeof json.model === 'string' && json.model) replyModel = json.model;
    if (json.usage) usage = json.usage;
    const choice = json.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;

    const delta = choice.delta;
    if (!delta) return;
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      handlers.onDelta(delta.content);
    }
    // 思考流：字段名两家不一样，都认
    const think = delta.reasoning_content ?? delta.reasoning;
    if (typeof think === 'string' && think) {
      reasoning += think;
      handlers.onReasoning?.(think);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = typeof tc.index === 'number' ? tc.index : 0;
        const part = toolParts.get(idx) ?? { id: '', name: '', arguments: '' };
        if (tc.id && !part.id) part.id = tc.id;
        if (tc.function?.name && !part.name) part.name = tc.function.name;
        if (typeof tc.function?.arguments === 'string') {
          part.arguments += tc.function.arguments;
        }
        toolParts.set(idx, part);
      }
    }
  };

  try {
    await readSSE(resp.body, (frame) => {
      if (frame.event !== 'message' && frame.event) return;
      const dataStr = frame.data.trim();
      if (!dataStr || dataStr === '[DONE]') return;
      try {
        applyChunk(JSON.parse(dataStr));
      } catch {
        /* 心跳或日志帧，忽略 */
      }
    });
  } catch (e) {
    // 已经收到一半的内容别浪费：有正文就当作正常结束（对方可能提前断流）
    if (content) {
      return { content, model: replyModel, usage, finishReason: finishReason ?? 'stream-cut' };
    }
    throw e;
  }

  const toolCalls: ToolCall[] | undefined = toolParts.size
    ? [...toolParts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, p]) => ({ id: p.id || `call_${p.name}`, type: 'function' as const, function: { name: p.name, arguments: p.arguments } }))
    : undefined;

  return {
    content,
    model: replyModel,
    usage,
    toolCalls,
    finishReason,
    ...(reasoning ? { reasoning } : {}),
  };
}
