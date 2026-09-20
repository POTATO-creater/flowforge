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
  WaitConfig,
  SwitchConfig,
  StopConfig,
  NodeKind,
} from '../types';
import { useFlowStore } from '../store/flowStore';
import { NODE_FIELDS, VAR_FIELD, RAW_VAR_FIELD } from '../fieldDefs';
import { fetchSmart } from '../lib/net';
import { hnListUrl, hnItemUrl, factUrl, pickHnItem, pickFactText } from '../presets/sources';
import { assertNever } from '../lib/assertNever';
import {
  interpolate,
  interpolateForJS,
  buildAliases,
  setActiveAliases,
  type VarContext,
} from './vars';
import { callLLM, type ChatMessage, type ToolSpec } from './llm';
import { callTool, fetchPage, requestRaw } from './tools';
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
  const branchChoice = new Map<string, string>(); // 分岔节点 -> 命中的出边 id
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
      // 第一步：拿到一串编号
      const listRes = await fetchSmart(
        { url: hnListUrl(c.source), cors: 'direct', timeout: 20, signal },
        settings.proxyURL,
      );
      if (!Array.isArray(listRes.json)) {
        throw new Error('没能拿到榜单列表，稍后再试试。');
      }
      const ids = (listRes.json as number[]).slice(0, count);

      // 第二步：逐个取详情
      const items: { title: string; url: string; score: number }[] = [];
      for (const id of ids) {
        try {
          const r = await fetchSmart(
            { url: hnItemUrl(id), cors: 'direct', timeout: 15, signal },
            settings.proxyURL,
          );
          const it = pickHnItem(r.json);
          if (it.title) items.push(it);
        } catch {
          // 单条失败不影响整体
        }
      }
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

    default:
      // 漏写 case 会在这里编译失败，而不是运行时静默不执行
      return assertNever(kind, 'executeNode');
  }
}

/** 简易休眠，可被「停下」按钮中断 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
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

/** 解析「分多条路」的配置：每行「关键词=分支名」 */
function parseRoutes(raw: string): [string, string][] {
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
function parseFeed(xml: string, count: number): { title: string; link: string }[] {
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
function runDedupeIgnoreCase(value: unknown): string[] {
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
function unescapeUserInput(s: string): string {
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
function pickActiveHandle(kind: NodeKind, output: Record<string, unknown>): string | undefined {
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
function defaultHandleFor(kind: NodeKind): string {
  if (kind === 'switch') return 'fallback';
  return 'true';
}

/**
 * 取第一个上游节点产出的「值」。
 * 数据整理类节点需要拿到上游的结构化结果（而不只是拼好的文字），
 * 所以这里直接读 ctx 里上游的输出对象。
 */
function firstUpstreamValue(
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
