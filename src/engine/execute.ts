// ============================================================
// 执行引擎：从 start 拓扑执行，condition 分支，逐节点回写状态
// ============================================================
import type { Node, Edge } from '@xyflow/react';
import type { FlowNodeData, ApiSettings, ConditionConfig, CodeConfig, LLMConfig, ToolConfig, StartConfig, OutputConfig } from '../types';
import { useFlowStore } from '../store/flowStore';
import { interpolate, interpolateForJS, type VarContext } from './vars';
import { callLLM } from './llm';
import { callTool } from './tools';

export interface LogEntry {
  t: string;
  tag: 'info' | 'run' | 'ok' | 'err';
  msg: string;
}

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
    onLog({ t: now(), tag: 'err', msg: '没有「开始」节点，无法运行。请从左侧拖入一个「开始」节点。' });
    store.setRunning(false);
    return false;
  }
  if (startNodes.length > 1) {
    onLog({ t: now(), tag: 'info', msg: `检测到多个「开始」节点，仅执行第一个：${startNodes[0].data.label}` });
  }

  // 拓扑排序（Kahn）—— 条件分支视为同时具备 true/false 出边
  const order = topoSort(nodes, edges);
  if (!order) {
    onLog({ t: now(), tag: 'err', msg: '工作流存在环，无法执行。请移除循环连线。' });
    store.setRunning(false);
    return false;
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ctx: VarContext = {}; // nodeId -> output 对象
  const enabled = new Set<string>(); // 当前被激活（应执行）的节点
  const conditionBranch = new Map<string, boolean>(); // condition 节点 -> 分支结果
  enabled.add(startNodes[0].id);

  const controller = new AbortController();
  currentAbort = () => controller.abort();
  let failed = false;

  for (const id of order) {
    if (controller.signal.aborted) {
      onLog({ t: now(), tag: 'info', msg: '已手动停止。' });
      break;
    }
    // 只有被激活的节点才执行
    if (!enabled.has(id)) continue;
    const node = nodeById.get(id);
    if (!node) continue;

    const t0 = performance.now();
    const input = buildInput(node, ctx);
    store.setNodeRun(id, { status: 'running', input });
    onLog({ t: now(), tag: 'run', msg: `▶ ${node.data.label}（${node.data.kind}）开始执行` });

    try {
      const output = await executeNode(node, ctx, settings, controller.signal);
      ctx[id] = output;
      const dur = Math.round(performance.now() - t0);
      store.setNodeRun(id, { status: 'success', input, output, durationMs: dur });
      onLog({ t: now(), tag: 'ok', msg: `✓ ${node.data.label} 完成（${dur}ms）` });

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
      onLog({ t: now(), tag: 'err', msg: `✗ ${node.data.label} 失败：${message}` });
      failed = true;
      break; // 出错即停，保留上游结果
    }
  }

  currentAbort = undefined;
  store.setRunning(false);

  if (!failed && !controller.signal.aborted) {
    onLog({ t: now(), tag: 'ok', msg: '工作流执行结束。' });
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
  signal: AbortSignal,
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
        { model: c.model, system, prompt, temperature: c.temperature, maxTokens: c.maxTokens },
        signal,
      );
      return { content: r.content, model: r.model, usage: r.usage };
    }
    case 'tool': {
      const c = config as ToolConfig;
      const r = await callTool(c, ctx, signal);
      return { status: r.status, body: r.body, json: r.json };
    }
    case 'condition': {
      const c = config as ConditionConfig;
      const expr = interpolateForJS(c.expression, ctx);
      const value = evalExpr(expr);
      return { branch: value, value };
    }
    case 'code': {
      const c = config as CodeConfig;
      const input = firstUpstreamOutput(node.id, ctx);
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

// —— 辅助 ——
function now(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function buildInput(node: Node<FlowNodeData>, ctx: VarContext): unknown {
  // 返回变量解析后的配置，便于在 Logs / Inspector 查看实际输入
  const { kind, config } = node.data;
  switch (kind) {
    case 'llm': {
      const c = config as LLMConfig;
      return { system: interpolate(c.system, ctx), prompt: interpolate(c.prompt, ctx) };
    }
    case 'tool': {
      const c = config as ToolConfig;
      return {
        url: interpolate(c.url, ctx),
        headers: interpolate(c.headers, ctx),
        body: interpolate(c.body, ctx),
      };
    }
    case 'condition':
      return { expression: interpolateForJS((config as ConditionConfig).expression, ctx) };
    case 'code':
      return { expression: interpolateForJS((config as CodeConfig).expression, ctx) };
    case 'output':
      return { template: interpolate((config as OutputConfig).template, ctx) };
    default:
      return config;
  }
}

function firstUpstreamOutput(id: string, ctx: VarContext): unknown {
  const edges = useFlowStore.getState().edges;
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
    throw new Error(`条件表达式错误：${e instanceof Error ? e.message : String(e)}（表达式：${expr}）`);
  }
}

function evalCode(expr: string, input: unknown): unknown {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('input', `"use strict"; ${expr}`) (input);
  } catch (e) {
    throw new Error(`代码执行错误：${e instanceof Error ? e.message : String(e)}`);
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
