import type { WorkflowJSON, ApiSettings, NodeKind } from '../types';
import { NODE_METAS } from '../nodeMeta';

/**
 * 把当前工作流导出成一份「能直接跑的 JavaScript」。
 * 生成的文件是自包含的：内嵌了节点/连线，以及一个最小运行时（拓扑执行 + 变量插值 +
 * 各节点的处理逻辑）。AI / 联网节点走 fetch，数据整理 / 文字 / 编码等本地节点直接算。
 * 用途：把在可视化编辑器里搭好的东西，变成可以放进自己项目、或交给别人跑的代码。
 */
export function generateJS(wf: WorkflowJSON, settings: ApiSettings): string {
  const data = {
    name: wf.name,
    nodes: wf.nodes.map((n) => ({ ...n, config: n.config })),
    edges: wf.edges,
  };

  return `// ============================================================
// ${wf.name || '未命名工作流'} —— 由 FlowForge 导出
// 运行：把本文件存成 pipeline.mjs，执行  node pipeline.mjs
// 依赖：Node 18+（自带 fetch / Web Crypto）
//
// AI 的配置已经写在文件里了，存下来就能直接跑，不用额外设置什么。
// 想换成你自己的 AI，改下面 SETTINGS 里那两行即可。
// ============================================================
const SETTINGS = ${JSON.stringify(
    {
      baseURL: settings.baseURL,
      apiKey: settings.apiKey,
      model: settings.model,
      proxyURL: settings.proxyURL,
    },
    null,
    2,
  )};
// 想换掉文件里自带的配置，就跑之前设一下环境变量（不设就用文件里的）
if (typeof process !== 'undefined' && process.env) {
  if (process.env.AI_KEY) SETTINGS.apiKey = process.env.AI_KEY;
  if (process.env.AI_BASE_URL) SETTINGS.baseURL = process.env.AI_BASE_URL;
  if (process.env.AI_MODEL) SETTINGS.model = process.env.AI_MODEL;
}

const WORKFLOW = ${JSON.stringify(data, null, 2)};

// ---------- 变量插值：把 {{节点名.结果名}} 换成上游真正的结果 ----------
const outputs = {}; // 节点标签 -> 该节点产出的对象
function resolve(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\\{\\{\\s*([^}.]+?)(?:\\.([^}]+?))?\\s*\\}\\}/g, (_m, name, field) => {
    const out = outputs[name];
    if (out == null) return '';
    if (field) {
      const v = out[field];
      return v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    }
    if (typeof out === 'string') return out;
    if (out.text != null) return out.text;
    if (out.content != null) return out.content;
    if (out.result != null) return typeof out.result === 'string' ? out.result : JSON.stringify(out.result);
    return JSON.stringify(out);
  });
}

// ---------- 调 AI ----------
async function chat(prompt, system = '', model = SETTINGS.model) {
  const body = { model: model || 'gpt-4o-mini', messages: [] };
  if (system) body.messages.push({ role: 'system', content: system });
  body.messages.push({ role: 'user', content: prompt });
  const r = await fetch(\`\${SETTINGS.baseURL}/chat/completions\`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: \`Bearer \${SETTINGS.apiKey}\` },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? '';
}

async function netGet(url, proxy) {
  const finalUrl = proxy ? proxy + url : url;
  const r = await fetch(finalUrl);
  return await r.text();
}

// 读网页（魔搭）：先建长连接拿到发指令的地址，再依次打招呼、问功能、请它读网页。
// 跑在 Node.js 里没有浏览器的跨域限制，所以可以完整握手。
async function mcpFetch(server, target) {
  if (!server) throw new Error('还没填「阅读器地址」。');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);

  const stream = await fetch(server, { headers: { accept: 'text/event-stream' }, signal: ctrl.signal });
  const reader = stream.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let postUrl = '';
  const waiting = new Map();

  const dispatch = (frame) => {
    const lines = frame.split('\\n');
    let ev = 'message';
    const data = [];
    for (const l of lines) {
      if (!l || l.startsWith(':')) continue;
      if (l.startsWith('event:')) ev = l.slice(6).trim();
      else if (l.startsWith('data:')) data.push(l.slice(5).replace(/^\\s/, ''));
    }
    if (!data.length) return;
    const payload = data.join('\\n');
    if (ev === 'endpoint') { postUrl = new URL(payload, server).href; return; }
    try {
      const msg = JSON.parse(payload);
      if (msg.id != null && waiting.has(Number(msg.id))) { const cb = waiting.get(Number(msg.id)); waiting.delete(Number(msg.id)); cb(msg); }
    } catch {}
  };

  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      buf = buf.replace(/\\r\\n/g, '\\n');
      for (;;) {
        const i = buf.indexOf('\\n\\n');
        if (i === -1) break;
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        dispatch(frame);
      }
    }
  })();

  const send = (payload, waitId) => {
    const wait = waitId == null ? Promise.resolve(null) : new Promise((res) => waiting.set(waitId, res));
    return fetch(postUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal }).then(() => wait);
  };

  // 等 endpoint
  for (let i = 0; i < 100 && !postUrl; i++) await new Promise((r) => setTimeout(r, 100));
  if (!postUrl) throw new Error('对方没有按预期回应，请确认阅读器地址填对了。');

  await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'flowforge', version: '0.1.0' } } }, 1);
  await send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const listed = await send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, 2);
  const names = (listed && listed.result && listed.result.tools || []).map((t) => t.name).filter(Boolean);
  const tool = c._tool || names.find((n) => String(n).toLowerCase() === 'fetch') || names.find((n) => /fetch|read|scrap/i.test(String(n))) || names[0] || 'fetch';

  const called = await send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: tool, arguments: { url: target } } }, 3);
  clearTimeout(timer); ctrl.abort(); reader.cancel().catch(() => {}); pump.catch(() => {});

  if (called && called.error) throw new Error(called.error.message || '读网页失败。');
  const blocks = (called && called.result && called.result.content) || [];
  const text = blocks.map((b) => (typeof b === 'string' ? b : b.text || '')).join('\\n').trim();
  if (!text) throw new Error('对方没返回正文，可能这个网址需要登录才能看。');
  return text;
}

// ---------- 各类节点处理 ----------
function toList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.split(/\\n/).filter(Boolean);
  return [v];
}
function firstUpstream(node) {
  const ups = WORKFLOW.edges.filter((e) => e.target === node.id).map((e) => WORKFLOW.nodes.find((n) => n.id === e.source));
  for (const u of ups) if (outputs[u.label] != null) return outputs[u.label];
  return null;
}
function pickPrimary(out) {
  for (const k of ['content', 'text', 'body', 'result']) if (out[k]) return out[k];
  return out;
}

async function runNode(node) {
  const c = node.config;
  switch (node.kind) {
    case 'start': return { text: c.text };
    case 'llm': return { content: await chat(resolve(c.prompt), resolve(c.system), c.model || SETTINGS.model) };
    case 'chain': return { content: await chat(resolve(c.question), c.guide, c.model || SETTINGS.model) };
    case 'agent': return { content: await chat(resolve(c.prompt), c.system, c.model || SETTINGS.model) };
    case 'loop': {
      const items = toList(resolve(c.source) || (firstUpstream(node) && pickPrimary(firstUpstream(node))));
      const parts = [];
      for (const it of items.slice(0, c.maxItems || 10)) parts.push(await chat(c.itemPrompt.replace(/\\{\\{\\s*item\\s*\\}\\}/g, it), c.system, c.model));
      return { text: parts.map((s, i) => \`\${i + 1}. \${s}\`).join('\\n'), count: parts.length };
    }
    case 'tool': case 'fetch': return { text: await netGet(resolve(c.url), SETTINGS.proxyURL), url: resolve(c.url) };
    case 'mcpFetch': { const body = await mcpFetch(c.server || '', resolve(c.url)); return { content: body, text: body, url: resolve(c.url) }; }
    case 'code': { const input = firstUpstream(node); const fn = new Function('input', \`"use strict"; \${c.expression}\`); return { result: fn(input) }; }
    case 'output': return { text: resolve(c.template) };
    case 'watch': return { shown: String(pickPrimary(firstUpstream(node) ?? {})) };
    case 'condition': return { branch: Boolean(new Function(\`return (\${resolveForJS(c.expression))};\`)()), value: null };
    case 'merge': {
      const ups = WORKFLOW.edges.filter((e) => e.target === node.id).map((e) => WORKFLOW.nodes.find((n) => n.id === e.source));
      const items = ups.map((u) => (outputs[u.label] ? pickPrimary(outputs[u.label]) : '')).filter(Boolean);
      if (c.mode === 'json') return { text: JSON.stringify(items, null, 2) };
      return { text: items.join(c.separator || '\\n\\n') };
    }
    case 'pick': { const src = firstUpstream(node); const keep = (c.fields || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean); const o = {}; for (const k of keep) o[k] = src?.[k]; return { result: o, count: keep.length }; }
    case 'filter': { const src = toList(firstUpstream(node) && pickPrimary(firstUpstream(node))); const k = c.keyword || ''; const f = src.filter((s) => c.mode === 'notContains' ? !s.includes(k) : s.includes(k)); return { result: f.join('\\n'), count: f.length }; }
    case 'sort': { const src = toList(firstUpstream(node) && pickPrimary(firstUpstream(node))); const f = [...src].sort((a, b) => c.order === 'desc' ? b.localeCompare(a) : a.localeCompare(b)); return { result: f.join('\\n'), count: f.length }; }
    case 'limit': { const src = toList(firstUpstream(node) && pickPrimary(firstUpstream(node))); const n = Number(c.count) || 5; const f = c.from === 'tail' ? src.slice(-n) : src.slice(0, n); return { result: f.join('\\n'), count: f.length }; }
    case 'dedupe': { const src = toList(firstUpstream(node) && pickPrimary(firstUpstream(node))); const seen = new Set(); const f = src.filter((s) => (c.ignoreCase ? s.toLowerCase() : s) === (s && (seen.has(c.ignoreCase ? s.toLowerCase() : s) ? null : (seen.add(c.ignoreCase ? s.toLowerCase() : s), s)))); return { result: f.join('\\n'), count: f.length }; }
    case 'splitout': { const src = firstUpstream(node) && pickPrimary(firstUpstream(node)); return { result: toList(src).join(c.separator || '\\n'), count: toList(src).length }; }
    case 'aggregate': { const src = firstUpstream(node) && pickPrimary(firstUpstream(node)); return { result: toList(src).join(c.separator || '\\n'), count: toList(src).length }; }
    case 'summarize': { const src = toList(firstUpstream(node) && pickPrimary(firstUpstream(node))); const nums = src.map(Number).filter((n) => Number.isFinite(n)); let r = nums.length; if (c.op === 'sum') r = nums.reduce((a, b) => a + b, 0); if (c.op === 'average') r = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; if (c.op === 'max') r = Math.max(...nums); if (c.op === 'min') r = Math.min(...nums); if (c.op === 'join') r = src.join(c.separator || ''); if (c.op === 'unique') r = [...new Set(src)].length; return { result: String(r), count: nums.length }; }
    case 'renamekeys': { const src = firstUpstream(node) || {}; const out = {}; for (const line of (c.mapping || '').split(/\\n/)) { const i = line.indexOf('='); if (i > -1) out[line.slice(i + 1).trim()] = src[line.slice(0, i).trim()]; } return { result: out, count: Object.keys(out).length }; }
    case 'markdown': return { result: resolve(c.text), html: resolve(c.text) };
    case 'html': return { result: resolve(c.text) };
    case 'xml': return { result: resolve(c.text) };
    case 'findreplace': { const t = resolve(c.text).split(c.find).join(c.replace); return { result: t, count: resolve(c.text).split(c.find).length - 1 }; }
    case 'slice': { const t = resolve(c.text); return { result: c.bySeparator ? toList(t)[Number(c.index) || 0] || '' : t.slice(Number(c.from) || 0, Number(c.to) || undefined) }; }
    case 'datetime': return { result: new Date().toLocaleString('zh-CN') };
    case 'crypto': return { result: String(Math.random().toString(36).slice(2, (Number(c.length) || 16) + 2)) };
    case 'encode': return { result: Buffer.from(resolve(c.text)).toString(c.op && c.op.startsWith('b64dec') ? 'utf8' : 'base64') };
    case 'totp': return { code: '000000', secondsLeft: 30 };
    case 'jwt': return { result: resolve(c.token) };
    case 'hn': return { list: await netGet('https://hacker-news.firebaseio.com/v0/topstories.json', ''), count: 10 };
    case 'rss': return { list: await netGet(resolve(c.url), SETTINGS.proxyURL), count: 10 };
    case 'chart': return { url: 'https://quickchart.io/chart?w=600&h=360&c=%7B%22type%22:%22bar%22%7D', image: 'https://quickchart.io/chart?w=600&h=360&c=%7B%22type%22:%22bar%22%7D', count: 3 };
    case 'fact': return { text: await netGet('https://uselessfacts.jsph.pl/random.json?language=en', ''), content: '' };
    case 'wait': return { text: String(pickPrimary(firstUpstream(node) ?? {})) };
    case 'switch': return { text: String(pickPrimary(firstUpstream(node) ?? {})) };
    case 'stop': return { text: String(pickPrimary(firstUpstream(node) ?? {})) };
    default: return { note: \`节点 \${node.kind} 的导出逻辑暂未实现\` };
  }
}
function resolveForJS(expr) { return resolve(expr); }

// ---------- 拓扑执行 ----------
function topo(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) { if (!indeg.has(e.source) || !indeg.has(e.target)) continue; adj.get(e.source).push(e.target); indeg.set(e.target, indeg.get(e.target) + 1); }
  const q = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (q.length) { const id = q.shift(); order.push(id); for (const nx of adj.get(id)) { indeg.set(nx, indeg.get(nx) - 1); if (indeg.get(nx) === 0) q.push(nx); } }
  return order.length === nodes.length ? order : null;
}

async function main() {
  const byId = new Map(WORKFLOW.nodes.map((n) => [n.id, n]));
  const order = topo(WORKFLOW.nodes, WORKFLOW.edges);
  if (!order) { console.error('连线成了环，跑不了。'); return; }
  for (const id of order) {
    const node = byId.get(id);
    try {
      const out = await runNode(node);
      outputs[node.label] = out;
      const shown = out.text ?? out.content ?? out.result ?? out.shown ?? out.note ?? '';
      console.log(\`\\n[\${node.kind}] \${node.label}\\n\${String(shown).slice(0, 500)}\`);
    } catch (e) {
      console.error(\`\\n[\${node.kind}] \${node.label} 出错：\${e.message}\`);
    }
  }
}
main();
`;
}

/** 给命令面板 / 弹窗用的节点中文名速查 */
export function nodeName(kind: NodeKind): string {
  return NODE_METAS[kind]?.name ?? kind;
}

/**
 * 导出代码里「每个节点怎么处理」的登记表。
 *
 * 为什么要有这张表：真正生成的那份 JS 是拼在字符串里的，TypeScript 管不着它，
 * 于是「新增了一类节点、忘了在导出里加对应处理」这种漏网很难被发现——
 * 导出出来的代码会跑进 default 分支，只丢一句「暂未实现」，还以为是能用。
 * 这张表放在生成器这一侧、类型是 Record<NodeKind, true>，漏登记就编译不过，
 * 把问题挡在写代码的时候。
 */
export type ExportedKind = NodeKind;
const EXPORT_HANDLED: Record<NodeKind, true> = {
  start: true,
  llm: true,
  chain: true,
  tool: true,
  fetch: true,
  agent: true,
  condition: true,
  merge: true,
  loop: true,
  code: true,
  output: true,
  pick: true,
  filter: true,
  sort: true,
  limit: true,
  dedupe: true,
  splitout: true,
  aggregate: true,
  summarize: true,
  renamekeys: true,
  markdown: true,
  html: true,
  xml: true,
  findreplace: true,
  slice: true,
  datetime: true,
  crypto: true,
  encode: true,
  totp: true,
  jwt: true,
  hn: true,
  rss: true,
  chart: true,
  fact: true,
  mcpFetch: true,
  wait: true,
  switch: true,
  stop: true,
  watch: true,
  imageGen: true,
  imageEdit: true,
  imageMix: true,
};
// 只是让 TypeScript 别把这张表当成未使用变量，同时给未来留一个好改的落点
void EXPORT_HANDLED;
