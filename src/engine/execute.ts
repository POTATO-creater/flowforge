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
  PickConfig,
  FilterConfig,
  SortConfig,
  LimitConfig,
  DedupeConfig,
  SplitOutConfig,
  AggregateConfig,
  SummarizeConfig,
  RenameKeysConfig,
  MarkdownConfig,
  HtmlConfig,
  XmlConfig,
  FindReplaceConfig,
  SliceConfig,
  DateTimeConfig,
  CryptoConfig,
  EncodeConfig,
  TotpConfig,
  JwtConfig,
  HnConfig,
  RssConfig,
  ChartConfig,
  FactConfig,
  McpFetchConfig,
  WaitConfig,
  SwitchConfig,
  StopConfig,
  WatchConfig,
  ImageGenConfig,
  ImageEditConfig,
  ImageMixConfig,
} from '../types';
import { useFlowStore } from '../store/flowStore';
import { toast } from '../lib/toast';
import { NODE_FIELDS, VAR_FIELD, RAW_VAR_FIELD } from '../fieldDefs';
import { fetchSmart } from '../lib/net';
import { hnListUrl, pickHnList, factUrl, pickFactText } from '../presets/sources';
import { assertNever } from '../lib/assertNever';
import {
  interpolate,
  interpolateForJS,
  buildAliases,
  setActiveAliases,
  type VarContext,
} from './vars';
import { callTool, fetchPage } from './tools';
import { mcpFetchPage } from './mcp';
import {
  toList,
  renderObject,
  runPickFields,
  runFilter,
  runSort,
  runLimit,
  runRemoveDuplicates,
  runSplitOut,
  runAggregate,
  runSummarize,
  runRenameKeys,
} from './datasets';
import {
  markdownToHtml,
  htmlToMarkdown,
  htmlToText,
  extractHtml,
  xmlToObject,
  objectToXml,
  runFindReplace,
  runSlice,
  runDateTime,
  runHash,
  runHmac,
  runRandom,
  runEncode,
  runTotp,
  runJwt,
} from './text';

import { mockOutput } from './exec/mock';
import { runImageEdit, runImageGen, runImageMix } from './exec/media';
import type { LogEntry, NodeReporter } from './exec/types';
import { callLLMStream } from './llm';
import {
  buildInput,
  defaultHandleFor,
  evalCode,
  evalExpr,
  firstUpstreamNodeId,
  firstUpstreamOutput,
  firstUpstreamValue,
  findFieldLoose,
  mergeUpstream,
  now,
  parseFeed,
  parseRoutes,
  pickActiveHandle,
  pickPrimaryValue,
  readableFieldName,
  resolveImageInput,
  runAgent,
  runDedupeIgnoreCase,
  runLoop,
  sleep,
  splitReasoning,
  topoSort,
  unescapeUserInput,
  valueToString,
} from './exec/helpers';

// 外面用的都还从 './execute' 拿，import 路径不用改
export type { LogEntry } from './exec/types';
export { slugifyRoute } from './exec/helpers';

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
  const branchChoice = new Map<string, string>(); // 分岔节点 -> 命中的出边 id
  enabled.add(startNodes[0].id);

  const controller = new AbortController();
  currentAbort = () => controller.abort();
  let failed = false;
  let breakpointHit = false;

  // 跑得太久时提醒一声：不是卡死了，还在干活；不想等随时能停
  const longRunTimer = setTimeout(() => {
    if (controller.signal.aborted || failed) return;
    const msg = '已经跑了 30 秒还没完，还在干活。不想等可以点「停下」。';
    onLog({ t: now(), tag: 'info', msg: `⏳ ${msg}` });
    toast(msg);
  }, 30000);

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
    // 断点：运行到这个节点之前先停下，便于排查中间结果
    if (node.data.breakpoint) {
      breakpointHit = true;
      onLog({ t: now(), tag: 'info', msg: `⏸ 在「${node.data.label}」的断点停下了，后面的还没跑。` });
      store.setRunning(false);
      break;
    }
    const report = makeReporter(id);
    store.setNodeRun(id, { status: 'running', input, startedAt: Date.now() });
    onLog({ t: now(), tag: 'run', msg: `▶ 开始「${node.data.label}」` });

    try {
      const output = await executeNode(node, ctx, settings, edges, controller.signal, onLog, report);
      ctx[id] = output;
      const dur = Math.round(performance.now() - t0);
      store.setNodeRun(id, {
        status: 'success',
        input,
        output,
        durationMs: dur,
        partial: undefined,
        note: undefined,
      });
      onLog({ t: now(), tag: 'ok', msg: `✓ 「${node.data.label}」做好了，用了 ${dur} 毫秒` });

      // 先算出「这个节点该激活哪条出边」，再据此决定下游谁进入队列
      const activeHandle = pickActiveHandle(node.data.kind, output);
      if (activeHandle !== undefined) {
        branchChoice.set(id, activeHandle);
      }
      for (const e of edges.filter((ed) => ed.source === id)) {
        if (activeHandle !== undefined) {
          // 分岔节点：只激活命中那一条出边
          const handle = e.sourceHandle ?? defaultHandleFor(node.data.kind);
          if (handle !== activeHandle) continue;
        }
        if (!enabled.has(e.target)) enabled.add(e.target);
      }
    } catch (err) {
      const dur = Math.round(performance.now() - t0);
      const message = err instanceof Error ? err.message : String(err);
      store.setNodeRun(id, {
        status: 'error',
        input,
        error: message,
        durationMs: dur,
        partial: undefined,
        note: undefined,
      });
      onLog({ t: now(), tag: 'err', msg: `✗ 「${node.data.label}」没跑通：${message}` });
      failed = true;
      break; // 出错即停，保留上游结果
    } finally {
      report.done();
    }
  }

  clearTimeout(longRunTimer);
  currentAbort = undefined;
  store.setRunning(false);

  if (breakpointHit) {
    onLog({
      t: now(),
      tag: 'info',
      msg: '在断点停下了。想继续就再点「跑一遍」（会从开头重跑），或去掉这个断点。',
    });
  } else if (!failed && !controller.signal.aborted) {
    onLog({ t: now(), tag: 'ok', msg: '整条流程跑完了。' });
  }
  return !failed && !breakpointHit;
}

/** 当前运行的 abort 句柄（模块级，供 stopWorkflow 调用） */
let currentAbort: (() => void) | undefined;
export function stopWorkflow() {
  currentAbort?.();
}

// ============================================================
// 流式中间态的「写回」层
//
// 节点跑起来以后，AI 一字一句往外蹦、出图一秒一秒地等，
// 这些中间态不能每个字都往界面塞（会把画布卡死），
// 所以在这里攒着，每 100 毫秒统一写一次。
// ============================================================

/** 给一个正在跑的节点造一套中间态上报器。跑完记得调 done() 收尾 */
function makeReporter(id: string): NodeReporter & { done: () => void } {
  let partial = '';
  let note = '';
  let dirty = false;
  const flush = () => {
    if (!dirty) return;
    dirty = false;
    useFlowStore.getState().setNodeRun(id, { status: 'running', partial, note });
  };
  const timer = setInterval(flush, 100);
  return {
    note: (msg) => {
      note = msg;
      dirty = true;
    },
    delta: (text) => {
      partial += text;
      dirty = true;
    },
    reset: () => {
      partial = '';
      note = '';
      dirty = true;
    },
    done: () => clearInterval(timer),
  };
}

/**
 * 单节点重跑：只运行目标节点及其上游（用来反复调试某一步，而不必每次都重跑整张图）。
 * 复用 executeNode 作为单节点执行器，所以行为和整跑完全一致。
 */
export async function runSingleNode(id: string, onLog: (e: LogEntry) => void): Promise<boolean> {
  const store = useFlowStore.getState();
  const { nodes, edges, settings } = store;

  const target = nodes.find((n) => n.id === id);
  if (!target) {
    onLog({ t: now(), tag: 'err', msg: '找不到要重跑的节点。' });
    return false;
  }

  // 收集目标节点及其全部上游祖先
  const ancestors = new Set<string>();
  const visit = (nid: string) => {
    if (ancestors.has(nid)) return;
    ancestors.add(nid);
    for (const e of edges.filter((ed) => ed.target === nid)) visit(e.source);
  };
  visit(id);

  const order = topoSort(nodes, edges);
  if (!order) {
    onLog({ t: now(), tag: 'err', msg: '节点之间连成了圈，绕不出来，没法单独跑。' });
    return false;
  }
  const runOrder = order.filter((x) => ancestors.has(x));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // 需要从某个「开始」节点作为入口
  const starts = nodes.filter((n) => n.data.kind === 'start' && ancestors.has(n.id));
  if (starts.length === 0) {
    onLog({
      t: now(),
      tag: 'info',
      msg: `「${target.data.label}」的上游没有「开始」节点，没法单独跑——它得先有输入。`,
    });
    return false;
  }

  setActiveAliases(
    buildAliases(
      nodes.map((n) => ({
        id: n.id,
        label: n.data.label,
        resultName: NODE_FIELDS[n.data.kind].resultName ?? VAR_FIELD[n.data.kind],
        rawField: RAW_VAR_FIELD[n.data.kind],
      })),
    ),
  );

  const ctx: VarContext = {};
  const enabled = new Set<string>(starts.map((n) => n.id));
  let failed = false;
  let stopped = false;

  // 单节点重跑也要能被打断。以前这里给的是「一次性的、没人持有」的信号，
  // 于是点了「停下」对它毫无作用，遇到慢任务只能干等。
  const controller = new AbortController();
  currentAbort = () => controller.abort();

  for (const nid of runOrder) {
    if (controller.signal.aborted) {
      stopped = true;
      onLog({ t: now(), tag: 'info', msg: '你点了停下，就不继续了。' });
      break;
    }
    if (!enabled.has(nid)) continue;
    const node = nodeById.get(nid);
    if (!node) continue;

    const t0 = performance.now();
    const input = buildInput(node, ctx);
    const report = makeReporter(nid);
    store.setNodeRun(nid, { status: 'running', input, startedAt: Date.now() });
    onLog({ t: now(), tag: 'run', msg: `▶ 跑「${node.data.label}」` });

    try {
      const output = await executeNode(node, ctx, settings, edges, controller.signal, onLog, report);
      ctx[nid] = output;
      const dur = Math.round(performance.now() - t0);
      store.setNodeRun(nid, {
        status: 'success',
        input,
        output,
        durationMs: dur,
        partial: undefined,
        note: undefined,
      });
      onLog({ t: now(), tag: 'ok', msg: `✓ 「${node.data.label}」做好了（${dur} 毫秒）` });

      for (const e of edges.filter((ed) => ed.source === nid && ancestors.has(ed.target))) {
        if (!enabled.has(e.target)) enabled.add(e.target);
      }
      // 跑到目标节点就停，只回写它的结果
      if (nid === id) {
        onLog({ t: now(), tag: 'ok', msg: '只跑了这一个，结果已经显示在卡片上。' });
        break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      store.setNodeRun(nid, {
        status: 'error',
        input,
        error: message,
        durationMs: Math.round(performance.now() - t0),
        partial: undefined,
        note: undefined,
      });
      onLog({ t: now(), tag: 'err', msg: `✗ 「${node.data.label}」没跑通：${message}` });
      failed = true;
      break;
    } finally {
      report.done();
    }
  }

  currentAbort = undefined;
  return !failed && !stopped;
}

// —— 执行单个节点 ——
async function executeNode(
  node: Node<FlowNodeData>,
  ctx: VarContext,
  settings: ApiSettings,
  edges: Edge[],
  signal: AbortSignal,
  onLog: (e: LogEntry) => void,
  /**
   * 中间态上报（流式的第二层）。
   * AI 回答一字一句往外蹦、出图一秒一秒地等，都从这里推到卡片上，
   * 让人看得出它没卡死。不传就当没有。
   */
  report?: NodeReporter,
): Promise<Record<string, unknown>> {
  const { kind, config } = node.data;

  // 假数据模式：AI / 联网类节点直接返回构造好的结果，先把流程跑通
  if (useFlowStore.getState().mockMode) {
    const mocked = mockOutput(kind, config);
    if (mocked) return mocked;
  }

  switch (kind) {
    case 'start': {
      const c = config as StartConfig;
      return { text: c.text };
    }

    case 'llm': {
      const c = config as LLMConfig;
      const system = interpolate(c.system, ctx);
      const prompt = interpolate(c.prompt, ctx);
      report?.reset();
      report?.note('正在回答…');
      const r = await callLLMStream(
        settings,
        {
          model: c.model,
          system,
          prompt,
          temperature: c.temperature,
          maxTokens: c.maxTokens,
        },
        { onDelta: (t) => report?.delta(t) },
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
      report?.reset();
      report?.note('正在一步步想…');
      const r = await callLLMStream(
        settings,
        { model: c.model, system, prompt: question, temperature: 0.3, maxTokens: 2048 },
        { onDelta: (t) => report?.delta(t) },
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
      return await runAgent(c, ctx, settings, signal, onLog, report);
    }

    case 'tool': {
      const c = config as ToolConfig;
      const r = await callTool(c, ctx, signal, settings.proxyURL);
      if (r.note) {
        onLog({ t: now(), tag: 'info', msg: `  ${r.note}` });
      }
      return { status: r.status, body: r.body, json: r.json };
    }

    case 'fetch': {
      const c = config as FetchConfig;
      const r = await fetchPage(
        {
          url: c.url,
          proxy: c.proxy,
          extract: c.extract,
          headers: c.headers,
          timeout: c.timeout,
          netProxy: settings.proxyURL,
        },
        ctx,
        signal,
      );
      onLog({
        t: now(),
        tag: 'info',
        msg: `  已读到 ${r.url}，一共 ${r.content.length} 个字`,
      });
      if (r.note) {
        onLog({ t: now(), tag: 'info', msg: `  ${r.note}` });
      }
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
      return await runLoop(node.id, c, ctx, settings, signal, onLog, report);
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

    // ==================== 数据整理（纯函数） ====================

    case 'pick': {
      const c = config as PickConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      const result = runPickFields(input, c);
      return { result: renderObject(result), count: Object.keys(result).length };
    }

    case 'filter': {
      const c = config as FilterConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      const result = runFilter(input, c);
      return { result: result.join('\n'), items: result, count: result.length };
    }

    case 'sort': {
      const c = config as SortConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      const result = runSort(input, c);
      return { result: result.join('\n'), items: result, count: result.length };
    }

    case 'limit': {
      const c = config as LimitConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      const result = runLimit(input, c);
      return { result: result.join('\n'), items: result, count: result.length };
    }

    case 'dedupe': {
      const c = config as DedupeConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      const before = toList(input).length;
      const result = c.ignoreCase ? runDedupeIgnoreCase(input) : runRemoveDuplicates(input);
      onLog({
        t: now(),
        tag: 'info',
        msg: `  原来 ${before} 条，去掉重复后剩 ${result.length} 条`,
      });
      return { result: result.join('\n'), items: result, count: result.length };
    }

    case 'splitout': {
      const c = config as SplitOutConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      const result = runSplitOut(input, unescapeUserInput(c.separator));
      return { result: result.join('\n'), items: result, count: result.length };
    }

    case 'aggregate': {
      const c = config as AggregateConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      const sep = unescapeUserInput(c.separator);
      const result = runAggregate(input, sep);
      return { result, count: toList(input).length };
    }

    case 'summarize': {
      const c = config as SummarizeConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      const sep = unescapeUserInput(c.separator) || '\n';
      const { result, count } = runSummarize(input, { op: c.op, separator: sep });
      return { result, count };
    }

    case 'renamekeys': {
      const c = config as RenameKeysConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      const result = runRenameKeys(input, c.mapping);
      return { result: renderObject(result), count: Object.keys(result).length };
    }

    // ==================== 文字处理 ====================

    case 'markdown': {
      const c = config as MarkdownConfig;
      const text = interpolate(c.text, ctx);
      const result = c.direction === 'md2html' ? markdownToHtml(text) : htmlToMarkdown(text);
      return { result, html: result, length: result.length };
    }

    case 'html': {
      const c = config as HtmlConfig;
      const text = interpolate(c.text, ctx);
      const result =
        c.op === 'extract'
          ? extractHtml(text, { selector: c.selector, attr: c.attr })
          : htmlToText(text);
      return { result, length: result.length };
    }

    case 'xml': {
      const c = config as XmlConfig;
      const text = interpolate(c.text, ctx);
      if (c.direction === 'xml2obj') {
        const obj = xmlToObject(text);
        return { result: JSON.stringify(obj, null, 2), data: obj };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text || '{}');
      } catch {
        throw new Error('要转成尖括号写法的内容，得是那种「字段名: 值」的规整格式。');
      }
      const result = objectToXml(parsed);
      return { result };
    }

    case 'findreplace': {
      const c = config as FindReplaceConfig;
      const text = interpolate(c.text, ctx);
      const { result, count } = runFindReplace(text, {
        find: c.find,
        replace: c.replace,
        regex: c.regex,
        all: c.all,
        ignoreCase: c.ignoreCase,
      });
      onLog({ t: now(), tag: 'info', msg: `  一共替换了 ${count} 处` });
      return { result, count };
    }

    case 'slice': {
      const c = config as SliceConfig;
      const text = interpolate(c.text, ctx);
      // 界面上的「第几段」从 1 开始数，这里换算成 0 开始
      const result = runSlice(text, {
        from: c.from > 0 ? c.from - 1 : 0,
        to: c.to,
        bySeparator: c.bySeparator,
        separator: unescapeUserInput(c.separator),
        index: c.index > 0 ? c.index - 1 : 0,
      });
      return { result, length: result.length };
    }

    // ==================== 日期与编码 ====================

    case 'datetime': {
      const c = config as DateTimeConfig;
      const source = interpolate(c.source, ctx);
      const result = runDateTime(source, {
        op: c.op,
        inputFormat: 'auto',
        format: c.format,
        amount: c.amount,
        unit: c.unit,
        target: interpolate(c.target, ctx),
      });
      return { result };
    }

    case 'crypto': {
      const c = config as CryptoConfig;
      const text = interpolate(c.text, ctx);
      if (c.op === 'random') {
        const result = runRandom(c.length, c.randomKind);
        return { result, length: result.length };
      }
      if (c.op === 'hmac') {
        const algo = c.algorithm === 'SHA-1' ? 'SHA-256' : c.algorithm;
        const result = await runHmac(text, interpolate(c.secret, ctx), algo);
        return { result, algorithm: algo };
      }
      const result = await runHash(text, c.algorithm);
      return { result, algorithm: c.algorithm };
    }

    case 'encode': {
      const c = config as EncodeConfig;
      const text = interpolate(c.text, ctx);
      const result = runEncode(text, { op: c.op });
      return { result, length: result.length };
    }

    case 'totp': {
      const c = config as TotpConfig;
      const { code, secondsLeft } = await runTotp(c.secret, {
        digits: c.digits,
        period: c.period,
        algorithm: c.algorithm,
      });
      onLog({
        t: now(),
        tag: 'info',
        msg: `  当前口令 ${code}，还有 ${secondsLeft} 秒换下一个`,
      });
      return { code, secondsLeft };
    }

    case 'jwt': {
      const c = config as JwtConfig;
      const result = await runJwt(interpolate(c.token, ctx), {
        op: c.op,
        secret: interpolate(c.secret, ctx),
        payload: interpolate(c.payload, ctx),
      });
      return { result };
    }

    // ==================== 网络类 ====================

    case 'hn': {
      const c = config as HnConfig;
      const count = Math.max(1, Math.min(50, Number(c.count) || 10));
      // Algolia 的接口一次就把榜单全带回来，不用像官方接口那样逐个取详情
      const r = await fetchSmart(
        { url: hnListUrl(c.source), cors: 'direct', timeout: 20, signal },
        settings.proxyURL,
      );
      if (r.note) onLog({ t: now(), tag: 'info', msg: `  ${r.note}` });

      const all = pickHnList(r.json);
      if (all.length === 0) {
        throw new Error('这次没拿到榜单，再跑一次试试。');
      }
      const items = all.filter((x) => x.title).slice(0, count);
      onLog({ t: now(), tag: 'info', msg: `  拿到了 ${items.length} 条热榜` });
      return {
        list: items.map((x) => `${x.title}（${x.score} 分）\n${x.url}`).join('\n\n'),
        items,
        count: items.length,
      };
    }

    case 'rss': {
      const c = config as RssConfig;
      const url = interpolate(c.url, ctx).trim();
      if (!url) throw new Error('这个节点还没填订阅地址。');
      const count = Math.max(1, Math.min(50, Number(c.count) || 10));
      const r = await fetchSmart({ url, cors: 'either', timeout: 25, signal }, settings.proxyURL);
      if (r.note) onLog({ t: now(), tag: 'info', msg: `  ${r.note}` });

      const items = parseFeed(r.text, count);
      onLog({ t: now(), tag: 'info', msg: `  一共读到 ${items.length} 篇` });
      return {
        list: items.map((x) => `${x.title}\n${x.link}`).join('\n\n'),
        items,
        count: items.length,
      };
    }

    case 'chart': {
      const c = config as ChartConfig;
      const labels = interpolate(c.labels, ctx)
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const values = interpolate(c.values, ctx)
        .split(/[,，\n]/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      if (labels.length === 0 || values.length === 0) {
        throw new Error('要画图得先有数字。请把「每根柱子叫什么」和「每根柱子多高」都填上。');
      }
      if (labels.length !== values.length) {
        throw new Error(
          `「叫什么」有 ${labels.length} 项，「多高」有 ${values.length} 项，两边数量得一样。`,
        );
      }
      const spec = {
        type: c.chartType,
        data: {
          labels,
          datasets: [{ label: interpolate(c.title, ctx) || '数值', data: values }],
        },
        options: c.title ? { title: { display: true, text: interpolate(c.title, ctx) } } : {},
      };
      // QuickChart 用网址传图表定义，生成的就是一张图片地址
      const url = `https://quickchart.io/chart?w=600&h=360&c=${encodeURIComponent(
        JSON.stringify(spec),
      )}`;
      return { url, image: url, count: values.length };
    }

    case 'fact': {
      const c = config as FactConfig;
      const r = await fetchSmart(
        { url: factUrl(c.source), cors: 'direct', timeout: 20, signal },
        settings.proxyURL,
      );
      const text = pickFactText(r.json);
      if (!text) throw new Error('这次没拿到内容，再跑一次试试。');
      return { text, content: text };
    }

    case 'mcpFetch': {
      const c = config as McpFetchConfig;
      const target = interpolate(c.url, ctx).trim();
      if (!target) throw new Error('这个节点还没填要读的网址。');

      const r = await mcpFetchPage(
        {
          url: target,
          timeout: c.timeout,
          tool: c.tool,
          server: c.server,
          netProxy: settings.proxyURL,
        },
        signal,
      );

      onLog({
        t: now(),
        tag: 'info',
        msg: `  已读到 ${r.url}，一共 ${r.content.length} 个字`,
      });

      return {
        content: r.content,
        title: r.title,
        url: r.url,
        status: r.status,
      };
    }

    // ==================== 出图 ====================

    /*
     * 三个出图节点共用一个执行体，差别只在「备了哪些料」：
     * 画一张图不给参考图，改图给一张，合成给两到四张。
     * 出图很慢，所以这里会把「在做什么、已等多久」推到卡片上，
     * 让人知道它没卡死 —— 这也是「所有 AI 节点都要有中间态」的一部分。
     */
    case 'imageGen': {
      const c = config as ImageGenConfig;
      const prompt = interpolate(c.prompt, ctx).trim();
      if (!prompt) throw new Error('这个节点还没写要画什么。');

      onLog({ t: now(), tag: 'info', msg: `  开始画图（${c.size} / ${c.ratio}）…` });
      const r = await runImageGen(settings, prompt, c.size, c.ratio, signal, report);
      const kb = Math.round(r.image.length / 1024);
      onLog({ t: now(), tag: 'ok', msg: `  画好了，约 ${kb} KB` });

      return { image: r.image, prompt, size: c.size, ratio: c.ratio, revised: r.revised };
    }

    case 'imageEdit': {
      const c = config as ImageEditConfig;
      const prompt = interpolate(c.prompt, ctx).trim();
      if (!prompt) throw new Error('这个节点还没写要改成什么样。');
      const src = resolveImageInput(c.image, ctx, node.id, edges);
      if (!src) throw new Error('这个节点还没选要改哪张图。');

      onLog({ t: now(), tag: 'info', msg: `  开始改图（${c.size} / ${c.ratio}）…` });
      const r = await runImageEdit(settings, src, prompt, c.size, c.ratio, signal, report);
      const kb = Math.round(r.image.length / 1024);
      onLog({ t: now(), tag: 'ok', msg: `  改好了，约 ${kb} KB` });

      return { image: r.image, prompt, size: c.size, ratio: c.ratio, revised: r.revised };
    }

    case 'imageMix': {
      const c = config as ImageMixConfig;
      const prompt = interpolate(c.prompt, ctx).trim();
      if (!prompt) throw new Error('这个节点还没写要怎么合。');

      // 一行一张来源，先做变量替换再逐行挑出有内容的
      const rows = interpolate(c.images, ctx)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (rows.length < 2) {
        throw new Error('合成至少要两张图。每一行填一张的来源，比如 {{第一张图.图片}}。');
      }

      // 上游给的可能不止一张，挨个收齐
      const picked = rows.map((row) => resolveImageInput(row, ctx, node.id, edges)).filter(Boolean);
      if (picked.length < 2) {
        throw new Error('这两张图还没跑出来。先把上游节点跑一遍，再跑这个节点。');
      }

      onLog({
        t: now(),
        tag: 'info',
        msg: `  开始合成 ${picked.length} 张图（${c.size} / ${c.ratio}）…`,
      });
      const r = await runImageMix(settings, picked, prompt, c.size, c.ratio, signal, report);
      const kb = Math.round(r.image.length / 1024);
      onLog({ t: now(), tag: 'ok', msg: `  合好了，约 ${kb} KB` });

      return {
        image: r.image,
        prompt,
        size: c.size,
        ratio: c.ratio,
        count: picked.length,
        revised: r.revised,
      };
    }

    // ==================== 流程控制补充 ====================

    case 'wait': {
      const c = config as WaitConfig;
      const secs = Math.max(0, Math.min(60, Number(c.seconds) || 0));
      const input = firstUpstreamValue(node.id, ctx, edges);
      if (secs > 0) {
        onLog({ t: now(), tag: 'info', msg: `  先等 ${secs} 秒…` });
        await sleep(secs * 1000, signal);
      }
      // 原样往下传，不改变内容
      return { text: typeof input === 'string' ? input : JSON.stringify(input) };
    }

    case 'switch': {
      const c = config as SwitchConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      const text = typeof input === 'string' ? input : JSON.stringify(input ?? '');
      const routes = parseRoutes(c.routes);

      let hit: string | undefined;
      for (const [keyword, handle] of routes) {
        if (keyword && text.includes(keyword)) {
          hit = handle;
          break;
        }
      }
      if (hit === undefined) {
        if (c.fallback === 'yes') {
          onLog({ t: now(), tag: 'info', msg: '  哪个关键词都没出现，走「其它」那条路' });
          hit = 'fallback';
        } else {
          onLog({ t: now(), tag: 'info', msg: '  哪个关键词都没出现，哪条路都不走' });
          return { branch: '', handle: '', text };
        }
      }
      const label = routes.find(([, h]) => h === hit)?.[0] ?? '其它';
      onLog({ t: now(), tag: 'info', msg: `  走了「${hit === 'fallback' ? '其它' : label}」这条路` });
      return { branch: hit, handle: hit, text };
    }

    case 'stop': {
      const c = config as StopConfig;
      const input = firstUpstreamValue(node.id, ctx, edges);
      // 把上面传下来的内容原样带上，方便在结果里看到「停在哪一步」
      const text = typeof input === 'string' ? input : JSON.stringify(input ?? '');
      if (c.when === 'always' || !text.trim()) {
        throw new Error(interpolate(c.message, ctx) || '按设置在这里停下来了。');
      }
      return { text };
    }

    case 'watch': {
      const c = config as WatchConfig;
      const up = firstUpstreamNodeId(node.id, edges);
      if (!up) {
        throw new Error('把「显示面板」连到想看的那个节点上，它才知道要看什么。');
      }
      const out = ctx[up];
      const rec = (out && typeof out === 'object' ? out : {}) as Record<string, unknown>;
      const want = (c.want ?? '').trim();

      // 没填就不挑，把整个结果原样显示出来
      if (!want) {
        const body = pickPrimaryValue(rec);
        return { shown: valueToString(body) };
      }

      // 填了就找这一项：先把「正文/结果」这类外号翻成真实字段名，再直接按原名找
      const readable = readableFieldName(up, want);
      const value =
        rec[readable] !== undefined
          ? rec[readable]
          : rec[want] !== undefined
            ? rec[want]
            : findFieldLoose(rec, want);

      if (value === undefined) {
        const keys = Object.keys(rec);
        throw new Error(
          keys.length
            ? `上面那个节点里没有「${want}」这一项。它有的是：${keys.join('、')}。`
            : `上面那个节点还没跑出结果，暂时看不到「${want}」。`,
        );
      }
      const shown = valueToString(value);
      // 如果挑出来的正好是一张图，标记一下，卡片和右侧都会把图贴出来
      const isPic = /^(https?:|data:image\/)/i.test(shown) && /\.(png|jpe?g|gif|webp|svg)|quickchart|chart/i.test(shown);
      return isPic ? { shown, image: shown } : { shown };
    }

    default:
      // 漏写 case 会在这里编译失败，而不是运行时静默不执行
      return assertNever(kind, 'executeNode');
  }
}
