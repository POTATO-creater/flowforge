// ============================================================
// 执行引擎用到的各种小工具
//
// 这些函数都不依赖工作流的状态，给什么算什么 —— 所以单独放在这里，
// 和「怎么一趟趟跑完流程」的主循环分开，改一个不影响另一个。
// ============================================================
import type { Node, Edge } from '@xyflow/react';
import type {
  NodeKind,
  ApiSettings,
  LLMConfig,
  ChainConfig,
  AgentConfig,
  ConditionConfig,
  CodeConfig,
  LoopConfig,
  MergeConfig,
  OutputConfig,
  ToolConfig,
  FetchConfig,
  McpFetchConfig,
  FlowNodeData,
} from '../../types';
import { VAR_FIELD, RAW_VAR_FIELD } from '../../fieldDefs';
import { interpolate, interpolateForJS, type VarContext } from '../vars';
import { callLLMStream, type ChatMessage, type ToolSpec } from '../llm';
import { requestRaw } from '../tools';
import { toList } from '../datasets';
import { useFlowStore } from '../../store/flowStore';
import { type LogEntry, LOOP_HARD_CAP, type NodeReporter } from './types';

export * from './types';


// ===================== 列表与字符串 =====================

/** 取第一个上游节点的 id（显示面板靠它知道该看谁） */
export function firstUpstreamNodeId(nodeId: string, edges: Edge[]): string | undefined {
  return edges.find((e) => e.target === nodeId)?.source;
}

/**
 * 把「正文 / 结果 / 图片」这种人话外号翻成上游输出里真实的字段名。
 * 每个节点在 VAR_FIELD 里都有一个外号，这里按种类反查。
 */
export function readableFieldName(sourceId: string, want: string): string {
  const kind = sourceId.split('_')[0] as NodeKind;
  const alias = VAR_FIELD[kind];
  if (alias === want) return RAW_VAR_FIELD[kind];
  return want;
}

/** 兜底：大小写、空格差异都忽略掉再找一遍 */
export function findFieldLoose(rec: Record<string, unknown>, want: string): unknown {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.]/g, '');
  const target = norm(want);
  for (const [k, v] of Object.entries(rec)) {
    if (norm(k) === target) return v;
  }
  return undefined;
}

/** 简易休眠，可被「停下」按钮中断 */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('已停止。'));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('已停止。'));
    };
    signal.addEventListener('abort', onAbort);
  });
}

// ===================== 路由与分岔 =====================

export function parseRoutes(raw: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of (raw ?? '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const keyword = t.slice(0, i).trim();
    const name = t.slice(i + 1).trim();
    if (!name) continue;
    out.push([keyword, slugifyRoute(name)]);
  }
  return out;
}

/** 把分支名转成能当「出口标识」用的字符串（中文也可以，只是个键） */
export function slugifyRoute(name: string): string {
  return name;
}

/** 简易订阅解析：兼容 RSS 与 Atom 两种常见写法 */
export function parseFeed(xml: string, count: number): { title: string; link: string }[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out: { title: string; link: string }[] = [];

  // RSS：<item><title><link>
  const rssItems = doc.querySelectorAll('item');
  if (rssItems.length > 0) {
    rssItems.forEach((it) => {
      if (out.length >= count) return;
      const title = it.querySelector('title')?.textContent?.trim() ?? '';
      const link = it.querySelector('link')?.textContent?.trim() ?? '';
      if (title) out.push({ title, link });
    });
    return out;
  }

  // Atom：<entry><title><link href>
  const entries = doc.querySelectorAll('entry');
  entries.forEach((it) => {
    if (out.length >= count) return;
    const title = it.querySelector('title')?.textContent?.trim() ?? '';
    const link = it.querySelector('link')?.getAttribute('href') ?? '';
    if (title) out.push({ title, link });
  });
  return out;
}

/** 去掉重复（忽略大小写版本） */
export function runDedupeIgnoreCase(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of toList(value)) {
    const key = s.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * 把用户在输入框里写的「\n」「\t」这类写法还原成真正的换行/制表符。
 *
 * 为什么需要：输入框里没法直接敲出一个「换行符」，用户只能写 \n 两个字符。
 * 如果直接拿去当分隔符用，就会永远匹配不到，分隔功能失效。
 */
export function unescapeUserInput(s: string): string {
  if (!s.includes('\\')) return s;
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}

/**
 * 算出这个节点该激活哪条出边（出边用 handle id 标识）。
 *
 * 返回 undefined 表示「不是分岔节点，所有出边都激活」。
 * 这样 condition（两条路）和 switch（多条路）共用同一套机制，
 * 将来再加别的分岔节点也不用改这里的调度逻辑。
 */
export function pickActiveHandle(kind: NodeKind, output: Record<string, unknown>): string | undefined {
  if (kind === 'condition') {
    if (output.branch === undefined) return undefined;
    return output.branch ? 'true' : 'false';
  }
  if (kind === 'switch') {
    const h = output.handle;
    return typeof h === 'string' ? h : undefined;
  }
  return undefined;
}

/** 分岔节点在没写明出口时的默认出口 */
export function defaultHandleFor(kind: NodeKind): string {
  if (kind === 'switch') return 'fallback';
  return 'true';
}

/**
 * 取第一个上游节点产出的「值」。
 * 数据整理类节点需要拿到上游的结构化结果（而不只是拼好的文字），

// ===================== 上游取值 =====================

 * 所以这里直接读 ctx 里上游的输出对象。
 */
export function firstUpstreamValue(
  nodeId: string,
  ctx: VarContext,
  edges: Edge[],
): unknown {
  const ups = edges.filter((e) => e.target === nodeId).map((e) => e.source);
  for (const up of ups) {
    const out = ctx[up];
    if (!out || typeof out !== 'object') continue;
    const rec = out as Record<string, unknown>;
    // 优先用「条目数组」，其次用正文类字段
    if (Array.isArray(rec.items)) return rec.items;
    const v = rec.content ?? rec.text ?? rec.body ?? rec.result ?? rec.answer;
    if (v !== undefined && v !== '') return v;
    // summarize 这类只有一个数字结果
    if (rec.result !== undefined) return rec.result;
    if (rec.count !== undefined) return rec.count;
  }
  return '';
}

// ============================================================
// 思维链：把模型输出拆成「步骤」与「最终答案」
// ============================================================
export function splitReasoning(text: string): { steps: string[]; final: string } {
  const normalized = text.replace(/\r\n/g, '\n');
  // 优先取「最终答案:」之后的内容
  const finalMatch = normalized.match(/(?:最终答案|结论|答案)\s*[:：]\s*([\s\S]*)$/);
  const final = finalMatch ? finalMatch[1].trim() : '';
  // 按「步骤N:」切分
  const parts = normalized
    .split(/(?:^|\n)\s*(?:步骤|第)\s*\d+\s*[步:：:]\s*/g)
    .map((s) => s.trim())
    .filter(Boolean);
  // 去掉被并进最后一段的「最终答案」
  const steps = parts.map((s) => s.replace(/(?:最终答案|结论|答案)\s*[:：][\s\S]*$/, '').trim()).filter(Boolean);
  return { steps, final };
}

// ============================================================
// 合并 / 聚合：按 edges 顺序取上游，保证结果确定
// ============================================================
export function mergeUpstream(
  id: string,
  c: MergeConfig,
  ctx: VarContext,
  edges: Edge[],
): Record<string, unknown> {
  // 按连线顺序收集上游输出，避免依赖对象键序
  const items: unknown[] = [];
  const seen = new Set<string>();
  for (const e of edges.filter((ed) => ed.target === id)) {
    if (seen.has(e.source)) continue;
    seen.add(e.source);
    const out = ctx[e.source];
    if (out === undefined) continue;
    items.push(pickPrimaryValue(out));
  }

  let text: string;
  switch (c.mode) {
    case 'first':
      text = valueToString(items[0]);
      break;
    case 'last':
      text = valueToString(items[items.length - 1]);
      break;
    case 'json':
      text = JSON.stringify(items, null, 2);
      break;
    case 'template':
      text = c.template
        ? interpolate(c.template, ctx)
        : items.map(valueToString).join(c.separator ?? '\n\n');
      break;
    case 'concat':
    default:
      text = items.map(valueToString).join(c.separator ?? '\n\n');
      break;
  }
  return { text, items, count: items.length };
}

/** 取上游输出里"最有内容"的字段，供合并/循环使用 */
export function pickPrimaryValue(out: Record<string, unknown>): unknown {
  for (const key of ['content', 'text', 'body', 'result']) {
    const v = out[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return out;
}

// ============================================================
// 循环 / 批量：节点内部对数组逐项调用模型（串行，可中断）
// ============================================================

// ===================== 数组与智能体 =====================

export function findUpstreamArray(id: string, ctx: VarContext): unknown[] | null {
  const edges = useFlowStore.getState().edges;
  for (const e of edges.filter((ed) => ed.target === id)) {
    const out = ctx[e.source];
    if (!out) continue;
    if (Array.isArray(out.items)) return out.items;
    if (Array.isArray(out.result)) return out.result;
    if (Array.isArray(out.results)) return out.results;
  }
  return null;
}

// ============================================================
// 工具调用：LLM 自主请求工具 -> 真实 HTTP -> 回灌 -> 再问
// ============================================================
export async function runAgent(
  c: AgentConfig,
  ctx: VarContext,
  settings: ApiSettings,
  signal: AbortSignal,
  onLog: (e: LogEntry) => void,
  /** 流式上报（想在哪看中间态由外层决定）；不传就静默跑 */
  report?: NodeReporter,
): Promise<Record<string, unknown>> {
  let tools: ToolSpec[] = [];
  if (c.tools.trim()) {
    try {
      const parsed = JSON.parse(interpolate(c.tools, ctx));
      if (!Array.isArray(parsed)) throw new Error('「它能用哪些工具」这里必须写成一个清单的样子（用 [ ] 包起来）。');
      tools = parsed as ToolSpec[];
    } catch (e) {
      throw new Error(`「它能用哪些工具」写错格式了：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const system = interpolate(c.system, ctx);
  const userPrompt = interpolate(c.prompt, ctx);
  const maxRounds = Math.max(1, Math.min(6, Number(c.maxRounds) || 3));

  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: userPrompt });

  const toolCalls: { name: string; args: string; result: string; status: number }[] = [];
  let content = '';
  let rounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    if (signal.aborted) throw new Error('你点了停下，就不继续了。');
    rounds = round + 1;
    report?.reset();
    report?.note(round === 0 ? '正在思考…' : '看完工具带回来的东西，再想一轮…');
    const reply = await callLLMStream(
      settings,
      { model: c.model, messages, tools: tools.length ? tools : undefined, temperature: 0.3 },
      { onDelta: (t) => report?.delta(t) },
      signal,
    );
    content = reply.content;

    // 没有工具调用 -> 结束
    if (!reply.toolCalls?.length) break;

    // 记录 assistant 的调用意图
    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.toolCalls });

    for (const call of reply.toolCalls) {
      const name = call.function?.name ?? '';
      const rawArgs = call.function?.arguments ?? '{}';
      let args: Record<string, unknown> = {};
      try {
        args = rawArgs ? JSON.parse(rawArgs) : {};
      } catch {
        /* 参数不合法时以空对象继续，错误会回灌给模型 */
      }
      onLog({ t: now(), tag: 'info', msg: `  → 去用「${name}」查一下（${compact(rawArgs)}）` });

      const { result, status } = await executeToolCall(name, args, tools, signal);
      toolCalls.push({ name, args: rawArgs, result, status });
      onLog({ t: now(), tag: 'info', msg: `  ← 「${name}」查到了，回来了 ${result.length} 个字` });

      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  return { content, toolCalls, rounds };
}

/**
 * 执行一次工具调用。
 * 说明：工具定义里的 parameters 只声明入参，真正的请求地址由约定规则推导——
 * 若存在名为 `url` 的参数则直接使用；否则回退到工具定义中的 `x-endpoint`
 * 扩展字段（非标准字段，供本应用内部使用）。
 */
export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  tools: ToolSpec[],
  signal: AbortSignal,
): Promise<{ result: string; status: number }> {
  const spec = tools.find((t) => t.function?.name === name);
  const endpoint =
    (typeof args.url === 'string' && args.url) ||
    ((spec?.function as Record<string, unknown> | undefined)?.['x-endpoint'] as string | undefined) ||
    '';

  if (!endpoint) {
    return {
      status: 0,
      result: `工具 ${name} 未配置可调用的 URL。请在该工具定义的 parameters 中加入 url 参数，或补充 "x-endpoint" 字段。`,
    };
  }

  // 若 URL 含占位符 {key}，用同名参数填充
  const resolved = endpoint.replace(/\{(\w+)\}/g, (_m, k: string) =>
    encodeURIComponent(String(args[k] ?? '')),
  );
  // 未用于路径的参数作为查询串带上
  const used = new Set(Object.keys(args).filter((k) => endpoint.includes(`{${k}}`)));
  const query = Object.entries(args)
    .filter(([k]) => k !== 'url' && !used.has(k))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(valueToString(v))}`)
    .join('&');
  const finalUrl = query ? `${resolved}${resolved.includes('?') ? '&' : '?'}${query}` : resolved;

  try {
    const r = await requestRaw(finalUrl, 'GET', {}, undefined, signal);
    const body = r.body.length > 8000 ? `${r.body.slice(0, 8000)}\n…（已截断）` : r.body;
    return { status: r.status, result: body || '(空响应)' };
  } catch (e) {
    return { status: 0, result: `调用失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

// ===================== 小工具 =====================

// —— 辅助 ——
export function now(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

export function compact(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 还原配置里写的 \n \t 等转义 */
export function decodeEscapes(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
}

export function valueToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ===================== 输入构造与求值 =====================

export function buildInput(node: Node<FlowNodeData>, ctx: VarContext): unknown {
  // 返回变量解析后的配置，便于在 Logs / Inspector 查看实际输入
  const { kind, config } = node.data;
  switch (kind) {
    case 'llm': {
      const c = config as LLMConfig;
      return { system: interpolate(c.system, ctx), prompt: interpolate(c.prompt, ctx) };
    }
    case 'chain': {
      const c = config as ChainConfig;
      return { question: interpolate(c.question, ctx), steps: c.steps };
    }
    case 'agent': {
      const c = config as AgentConfig;
      return { prompt: interpolate(c.prompt, ctx), tools: '（见工具定义）' };
    }
    case 'tool': {
      const c = config as ToolConfig;
      return {
        url: interpolate(c.url, ctx),
        headers: interpolate(c.headers, ctx),
        body: interpolate(c.body, ctx),
      };
    }
    case 'fetch': {
      const c = config as FetchConfig;
      return { url: interpolate(c.url, ctx), extract: c.extract };
    }
    case 'mcpFetch': {
      const c = config as McpFetchConfig;
      return { url: interpolate(c.url, ctx), timeout: c.timeout };
    }
    case 'condition':
      return { expression: interpolateForJS((config as ConditionConfig).expression, ctx) };
    case 'code':
      return { expression: interpolateForJS((config as CodeConfig).expression, ctx) };
    case 'loop': {
      const c = config as LoopConfig;
      return { source: interpolate(c.source, ctx), separator: c.separator };
    }
    case 'merge':
      return { mode: (config as MergeConfig).mode };
    case 'output':
      return { template: interpolate((config as OutputConfig).template, ctx) };
    default:
      return config;
  }
}

export function firstUpstreamOutput(id: string, ctx: VarContext, edges: Edge[]): unknown {
  for (const e of edges.filter((ed) => ed.target === id)) {
    if (ctx[e.source]) return ctx[e.source];
  }
  return undefined;
}

export function evalExpr(expr: string): boolean {
  try {
    // eslint-disable-next-line no-new-func
    return Boolean(new Function(`return (${expr});`)());
  } catch (e) {
    throw new Error(`「在什么情况下算「是」」这句话没看懂：${e instanceof Error ? e.message : String(e)}`);
  }
}

export function evalCode(expr: string, input: unknown): unknown {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('input', `"use strict"; ${expr}`)(input);
  } catch (e) {
    throw new Error(`这段加工代码跑不起来：${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Kahn 拓扑排序；存在环返回 null */
export function topoSort(nodes: Node<FlowNodeData>[], edges: Edge[]): string[] | null {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  });
  edges.forEach((e) => {
    if (!indeg.has(e.source) || !indeg.has(e.target)) return;
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  });
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const nxt of adj.get(id) ?? []) {
      const d = (indeg.get(nxt) ?? 0) - 1;
      indeg.set(nxt, d);
      if (d === 0) queue.push(nxt);
    }
  }
  return order.length === nodes.length ? order : null;
}

// ===================== 循环 / 批量 =====================

// ============================================================
// 循环 / 批量：节点内部对数组逐项调用模型（串行，可中断）
// ============================================================
export async function runLoop(
  id: string,
  c: LoopConfig,
  ctx: VarContext,
  settings: ApiSettings,
  signal: AbortSignal,
  onLog: (e: LogEntry) => void,
  /** 流式上报（想在哪看中间态由外层决定）；不传就静默跑 */
  report?: NodeReporter,
): Promise<Record<string, unknown>> {
  const rawSource = interpolate(c.source, ctx);
  const separator = decodeEscapes(c.separator || '\n---\n');
  const cap = Math.max(1, Math.min(LOOP_HARD_CAP, Number(c.maxItems) || 10));

  let items: string[];
  // 若上游是数组（如 merge/json 产出），优先直接用
  const upstreamArray = findUpstreamArray(id, ctx);
  if (upstreamArray) {
    items = upstreamArray.map(valueToString);
  } else {
    items = rawSource
      .split(separator)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (items.length === 0) {
    throw new Error('要处理的内容是空的。请检查「要处理的内容」有没有填，或者把「按什么切开」里的分隔符换一个试试。');
  }
  const truncated = items.length > cap;
  const work = items.slice(0, cap);
  if (truncated) {
    onLog({
      t: now(),
      tag: 'info',
      msg: `  一共 ${items.length} 段，太多了，只处理前面 ${cap} 段`,
    });
  }

  const system = interpolate(c.system, ctx);
  const results: string[] = [];
  for (let i = 0; i < work.length; i++) {
    if (signal.aborted) throw new Error('你点了停下，就不继续了。');
    const item = work[i];
    // {{item}} 单独替换，避免与全局变量插值混淆
    const prompt = interpolate(c.itemPrompt, ctx).replace(/\{\{\s*item\s*\}\}/g, item);
    onLog({ t: now(), tag: 'info', msg: `  正在处理第 ${i + 1} 段，共 ${work.length} 段…` });
    report?.reset();
    report?.note(`正在写第 ${i + 1} 段（共 ${work.length} 段）…`);
    const r = await callLLMStream(
      settings,
      { model: c.model, system, prompt, temperature: 0.5, maxTokens: 1024 },
      { onDelta: (t) => report?.delta(t) },
      signal,
    );
    results.push(r.content);
  }

  const joined = results.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return { results, text: joined, count: results.length, truncated };
}

/** 找一个上游输出的数组（merge/json 或 code 返回的数组） */

// ============================================================
// 出图：把「要参考的图」从上游捞出来
// ============================================================

/**
 * 把一个图片输入解析成可用的图片内容。
 *
 * 输入形态有三种，都要认：
 *   1. 变量写法 {{某节点.图片}} —— 最常见的，交给变量表去取；
 *   2. 已经是一段图片内容（data: 开头，或一长串裸内容）—— 直接可用；
 *   3. 一个图片网址 —— 原样返回，由出图执行器负责取回来。
 *
 * 取不到就返回空串，让调用方决定怎么提示（不同节点提示语不一样）。
 */
export function resolveImageInput(
  raw: string,
  ctx: VarContext,
  nodeId: string,
  edges: Edge[],
): string {
  const s = (raw ?? '').trim();
  if (!s) return '';

  // 形态 2 / 3：本身就已经是一份图，不用查变量
  if (/^data:image\//i.test(s) || /^https?:\/\//i.test(s)) return s;
  if (/^[A-Za-z0-9+/=\s]{200,}$/.test(s)) return s.replace(/\s+/g, '');

  // 形态 1：走变量替换。替换后若还是原样（说明这个变量没取到值），
  // 再退一步去上游节点里直接找「图片」这一项。
  const filled = interpolate(s, ctx).trim();
  if (filled && filled !== s) return filled;

  const ups = edges.filter((e) => e.target === nodeId).map((e) => e.source);
  for (const up of ups) {
    const out = ctx[up];
    if (!out || typeof out !== 'object') continue;
    const rec = out as Record<string, unknown>;
    // 出图类节点统一把结果放在 image 上；图表节点放在 url 上
    const v = rec.image ?? rec.imageUrl ?? rec.b64_json ?? rec.url ?? rec.chart;
    if (typeof v === 'string' && v) return v;
  }
  return '';
}
