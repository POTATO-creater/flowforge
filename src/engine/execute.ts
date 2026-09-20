// ============================================================
// 执行引擎：从 start 拓扑执行，condition 分支，逐节点回写状态
// ============================================================
import type { Node, Edge } from '@xyflow/react';
import type {
  FlowNodeData,
  ApiSettings,
  ConditionConfig,
  CodeConfig,
  LLMConfig,
  ChainConfig,
  ToolConfig,
  FetchConfig,
  AgentConfig,
  MergeConfig,
  LoopConfig,
  StartConfig,
  OutputConfig,
} from '../types';
import { useFlowStore } from '../store/flowStore';
import { NODE_FIELDS, VAR_FIELD, RAW_VAR_FIELD } from '../fieldDefs';
import {
  interpolate,
  interpolateForJS,
  buildAliases,
  setActiveAliases,
  type VarContext,
} from './vars';
import { callLLM, type ChatMessage, type ToolSpec } from './llm';
import { callTool, fetchPage, requestRaw } from './tools';

export interface LogEntry {
  t: string;
  tag: 'info' | 'run' | 'ok' | 'err';
  msg: string;
}

/** 循环节点的硬上限，防止误配导致 token 燃烧 */
const LOOP_HARD_CAP = 50;

/**
 * 执行整张工作流。onLog 用于实时把日志推给 UI。
 */
export async function runWorkflow(onLog: (e: LogEntry) => void): Promise<boolean> {
  const store = useFlowStore.getState();
  const nodes = store.nodes;
  const edges = store.edges;
  const settings = store.settings;

  store.resetRuns();
  store.setRunning(true);

  const startNodes = nodes.filter((n) => n.data.kind === 'start');
  if (startNodes.length === 0) {
    onLog({ t: now(), tag: 'err', msg: '画布上还没有「开始」节点，不知道该从哪跑。请先从左边拖一个「开始」过来。' });
    store.setRunning(false);
    return false;
  }
  if (startNodes.length > 1) {
    onLog({ t: now(), tag: 'info', msg: `画布上有好几个「开始」，只会用「${startNodes[0].data.label}」这一个。` });
  }

  // 拓扑排序（Kahn）—— 条件分支视为同时具备 true/false 出边
  const order = topoSort(nodes, edges);
  if (!order) {
    onLog({ t: now(), tag: 'err', msg: '节点之间连成了一个圈，绕不出来没法跑。请把多余的那条连线删掉。' });
    store.setRunning(false);
    return false;
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // 构建中文别名表，让 {{节点名.结果名}} 这种写法能被解析
  setActiveAliases(
    buildAliases(
      nodes.map((n) => ({
        id: n.id,
        label: n.data.label,
        // 给用户看的中文结果名
        resultName: NODE_FIELDS[n.data.kind].resultName ?? VAR_FIELD[n.data.kind],
        // 引擎内部真实字段名，变量最终要落到这里
        rawField: RAW_VAR_FIELD[n.data.kind],
      })),
    ),
  );
  const ctx: VarContext = {}; // nodeId -> output 对象
  const enabled = new Set<string>(); // 当前被激活（应执行）的节点
  const conditionBranch = new Map<string, boolean>(); // condition 节点 -> 分支结果
  enabled.add(startNodes[0].id);

  const controller = new AbortController();
  currentAbort = () => controller.abort();
  let failed = false;

  for (const id of order) {
    if (controller.signal.aborted) {
      onLog({ t: now(), tag: 'info', msg: '你点了停下，就不继续了。' });
      break;
    }
    // 只有被激活的节点才执行
    if (!enabled.has(id)) continue;
    const node = nodeById.get(id);
    if (!node) continue;

    const t0 = performance.now();
    const input = buildInput(node, ctx);
    store.setNodeRun(id, { status: 'running', input });
    onLog({ t: now(), tag: 'run', msg: `▶ 开始「${node.data.label}」` });

    try {
      const output = await executeNode(node, ctx, settings, edges, controller.signal, onLog);
      ctx[id] = output;
      const dur = Math.round(performance.now() - t0);
      store.setNodeRun(id, { status: 'success', input, output, durationMs: dur });
      onLog({ t: now(), tag: 'ok', msg: `✓ 「${node.data.label}」做好了，用了 ${dur} 毫秒` });

      // 先记录 condition 分支结果，再据此激活下游出边
      const isCondition = node.data.kind === 'condition';
      if (isCondition && output.branch !== undefined) {
        conditionBranch.set(id, Boolean(output.branch));
      }
      for (const e of edges.filter((ed) => ed.source === id)) {
        if (isCondition) {
          const branch = conditionBranch.get(id);
          const active = (e.sourceHandle ?? 'true') === (branch ? 'true' : 'false');
          if (!active) continue;
        }
        if (!enabled.has(e.target)) enabled.add(e.target);
      }
    } catch (err) {
      const dur = Math.round(performance.now() - t0);
      const message = err instanceof Error ? err.message : String(err);
      store.setNodeRun(id, { status: 'error', input, error: message, durationMs: dur });
      onLog({ t: now(), tag: 'err', msg: `✗ 「${node.data.label}」没跑通：${message}` });
      failed = true;
      break; // 出错即停，保留上游结果
    }
  }

  currentAbort = undefined;
  store.setRunning(false);

  if (!failed && !controller.signal.aborted) {
    onLog({ t: now(), tag: 'ok', msg: '整条流程跑完了。' });
  }
  return !failed;
}

/** 当前运行的 abort 句柄（模块级，供 stopWorkflow 调用） */
let currentAbort: (() => void) | undefined;
export function stopWorkflow() {
  currentAbort?.();
}

// —— 执行单个节点 ——
async function executeNode(
  node: Node<FlowNodeData>,
  ctx: VarContext,
  settings: ApiSettings,
  edges: Edge[],
  signal: AbortSignal,
  onLog: (e: LogEntry) => void,
): Promise<Record<string, unknown>> {
  const { kind, config } = node.data;
  switch (kind) {
    case 'start': {
      const c = config as StartConfig;
      return { text: c.text };
    }

    case 'llm': {
      const c = config as LLMConfig;
      const system = interpolate(c.system, ctx);
      const prompt = interpolate(c.prompt, ctx);
      const r = await callLLM(
        settings,
        {
          model: c.model,
          system,
          prompt,
          temperature: c.temperature,
          maxTokens: c.maxTokens,
        },
        signal,
      );
      return { content: r.content, model: r.model, usage: r.usage };
    }

    case 'chain': {
      const c = config as ChainConfig;
      const question = interpolate(c.question, ctx);
      const steps = Math.max(1, Math.min(10, Number(c.steps) || 3));
      const guide = interpolate(c.guide, ctx);
      const system = `${guide}\n\n请控制在 ${steps} 个步骤以内。`;
      const r = await callLLM(
        settings,
        { model: c.model, system, prompt: question, temperature: 0.3, maxTokens: 2048 },
        signal,
      );
      const { steps: stepList, final } = splitReasoning(r.content);
      return {
        content: final || r.content,
        reasoning: r.content,
        steps: stepList,
        model: r.model,
      };
    }

    case 'agent': {
      const c = config as AgentConfig;
      return await runAgent(c, ctx, settings, signal, onLog);
    }

    case 'tool': {
      const c = config as ToolConfig;
      const r = await callTool(c, ctx, signal);
      return { status: r.status, body: r.body, json: r.json };
    }

    case 'fetch': {
      const c = config as FetchConfig;
      const r = await fetchPage(
        { url: c.url, proxy: c.proxy, extract: c.extract, headers: c.headers, timeout: c.timeout },
        ctx,
        signal,
      );
      onLog({
        t: now(),
        tag: 'info',
        msg: `  已读到 ${r.url}，一共 ${r.content.length} 个字`,
      });
      return { content: r.content, title: r.title, url: r.url, status: r.status };
    }

    case 'condition': {
      const c = config as ConditionConfig;
      const expr = interpolateForJS(c.expression, ctx);
      const value = evalExpr(expr);
      return { branch: value, value };
    }

    case 'merge': {
      const c = config as MergeConfig;
      return mergeUpstream(node.id, c, ctx, edges);
    }

    case 'loop': {
      const c = config as LoopConfig;
      return await runLoop(node.id, c, ctx, settings, signal, onLog);
    }

    case 'code': {
      const c = config as CodeConfig;
      const input = firstUpstreamOutput(node.id, ctx, edges);
      const expr = interpolateForJS(c.expression, ctx);
      const result = evalCode(expr, input);
      return { result };
    }

    case 'output': {
      const c = config as OutputConfig;
      const text = interpolate(c.template, ctx);
      return { text };
    }
  }
}

// ============================================================
// 思维链：把模型输出拆成「步骤」与「最终答案」
// ============================================================
function splitReasoning(text: string): { steps: string[]; final: string } {
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
function mergeUpstream(
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
function pickPrimaryValue(out: Record<string, unknown>): unknown {
  for (const key of ['content', 'text', 'body', 'result']) {
    const v = out[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return out;
}

// ============================================================
// 循环 / 批量：节点内部对数组逐项调用模型（串行，可中断）
// ============================================================
async function runLoop(
  id: string,
  c: LoopConfig,
  ctx: VarContext,
  settings: ApiSettings,
  signal: AbortSignal,
  onLog: (e: LogEntry) => void,
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
    const r = await callLLM(settings, { model: c.model, system, prompt, temperature: 0.5, maxTokens: 1024 }, signal);
    results.push(r.content);
  }

  const joined = results.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return { results, text: joined, count: results.length, truncated };
}

/** 找一个上游输出的数组（merge/json 或 code 返回的数组） */
function findUpstreamArray(id: string, ctx: VarContext): unknown[] | null {
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
async function runAgent(
  c: AgentConfig,
  ctx: VarContext,
  settings: ApiSettings,
  signal: AbortSignal,
  onLog: (e: LogEntry) => void,
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
    const reply = await callLLM(
      settings,
      { model: c.model, messages, tools: tools.length ? tools : undefined, temperature: 0.3 },
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
async function executeToolCall(
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

// —— 辅助 ——
function now(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function compact(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 还原配置里写的 \n \t 等转义 */
function decodeEscapes(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
}

function valueToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function buildInput(node: Node<FlowNodeData>, ctx: VarContext): unknown {
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

function firstUpstreamOutput(id: string, ctx: VarContext, edges: Edge[]): unknown {
  for (const e of edges.filter((ed) => ed.target === id)) {
    if (ctx[e.source]) return ctx[e.source];
  }
  return undefined;
}

function evalExpr(expr: string): boolean {
  try {
    // eslint-disable-next-line no-new-func
    return Boolean(new Function(`return (${expr});`)());
  } catch (e) {
    throw new Error(`「在什么情况下算「是」」这句话没看懂：${e instanceof Error ? e.message : String(e)}`);
  }
}

function evalCode(expr: string, input: unknown): unknown {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('input', `"use strict"; ${expr}`)(input);
  } catch (e) {
    throw new Error(`这段加工代码跑不起来：${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Kahn 拓扑排序；存在环返回 null */
function topoSort(nodes: Node<FlowNodeData>[], edges: Edge[]): string[] | null {
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
