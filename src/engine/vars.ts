// ============================================================
// 变量解析：把 {{节点名.结果名}} 替换为对应节点的运行产出
//
// 界面上只用中文写法：{{大模型.结果}}
// 旧文件里的英文写法继续兼容：{{llm_ab12.content}}
//
// 【关键】结果名（如「结果」）只是给用户看的外号，
// 引擎内部产出用的始终是原始英文字段名（如 content）。
// 别名表的职责就是完成这层翻译。
// ============================================================

/** 上游产出表：nodeId -> output 对象 */
export type VarContext = Record<string, Record<string, unknown> | undefined>;

/** 一个引用最终落到的位置 */
interface Resolved {
  id: string;
  field: string;
}

/**
 * 别名表：把界面上可读的名字翻译成引擎内部坐标。
 */
export interface AliasTable {
  /** 「节点名.结果名」或「节点名.英文字段名」 -> { nodeId, 真实字段名 } */
  refs: Record<string, Resolved>;
  /** 节点名 -> 该节点的默认结果位置（用于 {{大模型}} 这种省略写法） */
  bare: Record<string, Resolved>;
}

const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** 沿点路径取值，如 getByPath(obj, 'a.b.0') */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
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

/**
 * 构建别名表。
 *
 * @param nodes 每项包含：节点 id、界面上的名字、界面上的结果名、引擎内部的真实字段名
 */
export function buildAliases(
  nodes: { id: string; label: string; resultName: string; rawField: string }[],
): AliasTable {
  const refs: Record<string, Resolved> = {};
  const bare: Record<string, Resolved> = {};
  for (const n of nodes) {
    if (!n.label) continue;
    // {{节点名}} → 默认结果
    bare[n.label] = { id: n.id, field: n.rawField };
    // {{节点名.结果名}} → 真实字段（用户看到的中文写法）
    refs[`${n.label}.${n.resultName}`] = { id: n.id, field: n.rawField };
    // {{节点名.英文字段名}} → 真实字段（兼容手写英文的情况）
    refs[`${n.label}.${n.rawField}`] = { id: n.id, field: n.rawField };
  }
  return { refs, bare };
}

/**
 * 当前生效的别名表（模块级）。
 * 执行开始时由执行器写入一次，interpolate / interpolateForJS 自动使用，
 * 这样不必给所有调用点都加参数。
 */
let activeAliases: AliasTable | undefined;
export function setActiveAliases(a: AliasTable | undefined) {
  activeAliases = a;
}

/** 把一个 {{...}} 里的引用解析成 { id, field } */
function resolveRef(ref: string, aliases?: AliasTable): Resolved {
  if (aliases) {
    const hit = aliases.refs[ref];
    if (hit) return hit;
    const bareHit = aliases.bare[ref];
    if (bareHit) return bareHit;
  }
  // 回退到原始 nodeId 写法（老文件 / 手写 id）
  const dot = ref.indexOf('.');
  return dot === -1
    ? { id: ref, field: '' }
    : { id: ref.slice(0, dot), field: ref.slice(dot + 1) };
}

/**
 * 字符串插值：把模板里的引用换成对应文字。
 * 找不到时保留原 token（便于用户发现没连上的引用）。
 */
export function interpolate(template: string, ctx: VarContext, aliases?: AliasTable): string {
  if (!template) return template;
  const table = aliases ?? activeAliases;
  return template.replace(TOKEN_RE, (_m, raw: string) => {
    const ref = raw.trim();
    // 循环节点内部的「当前这一小段」是保留名，不参与节点解析
    if (ref === 'item') return `{{${raw}}}`;
    const parsed = resolveRef(ref, table);
    const out = ctx[parsed.id];
    if (out == null) return `{{${raw}}}`;
    const val = parsed.field ? getByPath(out, parsed.field) : out;
    if (val === undefined) return `{{${raw}}}`;
    return valueToString(val);
  });
}

/**
 * 表达式插值：把引用替换成「安全的字面量」，
 * 使替换后的字符串仍然是合法代码（用于条件分支 / 程序加工节点）。
 */
export function interpolateForJS(template: string, ctx: VarContext, aliases?: AliasTable): string {
  if (!template) return template;
  const table = aliases ?? activeAliases;
  return template.replace(TOKEN_RE, (_m, raw: string) => {
    const ref = raw.trim();
    if (ref === 'item') return `{{${raw}}}`;
    const parsed = resolveRef(ref, table);
    const out = ctx[parsed.id];
    if (out == null) return 'undefined';
    const val = parsed.field ? getByPath(out, parsed.field) : out;
    if (val === undefined) return 'undefined';
    return JSON.stringify(val);
  });
}
