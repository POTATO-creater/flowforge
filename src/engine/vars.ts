// ============================================================
// 变量解析：将 {{nodeId.field}} 替换为对应节点的运行产出
// 上下文 ctx：nodeId -> 该节点 output 对象
// ============================================================

export type VarContext = Record<string, Record<string, unknown> | undefined>;

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

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
 * 字符串插值：把模板里的 {{id.field}} 换成对应字符串。
 * 找不到时保留原 token（便于用户发现未解析变量）。
 */
export function interpolate(template: string, ctx: VarContext): string {
  if (!template) return template;
  return template.replace(TOKEN_RE, (_m, raw: string) => {
    const ref = raw.trim();
    const dot = ref.indexOf('.');
    const id = dot === -1 ? ref : ref.slice(0, dot);
    const field = dot === -1 ? '' : ref.slice(dot + 1);
    const out = ctx[id];
    if (out == null) return `{{${raw}}}`;
    const val = field ? getByPath(out, field) : out;
    if (val === undefined) return `{{${raw}}}`;
    return valueToString(val);
  });
}

/**
 * 表达式插值：把 {{id.field}} 替换为“安全 JSON 字面量”，
 * 使替换后的字符串仍为合法 JS（用于 condition / code 节点）。
 */
export function interpolateForJS(template: string, ctx: VarContext): string {
  if (!template) return template;
  return template.replace(TOKEN_RE, (_m, raw: string) => {
    const ref = raw.trim();
    const dot = ref.indexOf('.');
    const id = dot === -1 ? ref : ref.slice(0, dot);
    const field = dot === -1 ? '' : ref.slice(dot + 1);
    const out = ctx[id];
    if (out == null) return 'undefined';
    const val = field ? getByPath(out, field) : out;
    if (val === undefined) return 'undefined';
    return JSON.stringify(val);
  });
}
