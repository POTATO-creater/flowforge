// ============================================================
// 数据整理类节点的实现（纯函数，不联网）
//
// 对应 n8n 的「Fire」类核心节点（Set / Filter / Sort / Limit /
// RemoveDuplicates / SplitOut / Aggregate / Summarize / RenameKeys）。
// 这些都不需要服务器，在浏览器里能 100% 跑通。
//
// 设计约定：上游给过来的东西可能是「一段文字」，也可能是「一串条目」。
// 所以每个函数都先做一次「归一化」，把各种形态统一成字符串数组再用。
// ============================================================

/** 把上游结果统一成字符串数组 */
export function toList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((v) => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    });
  }
  if (typeof value === 'string') {
    // 一大段文字：按换行切成条目，丢掉空行
    return value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  try {
    return [JSON.stringify(value)];
  } catch {
    return [String(value)];
  }
}

/** 把一行文字按「字段名: 值」的样子解析成对象，供挑字段/改字段名使用 */
export function parseLooseObject(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
  }
  const text = typeof value === 'string' ? value : toList(value).join('\n');
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) {
      const idx2 = line.indexOf('：');
      if (idx2 === -1) {
        // 没有分隔符：整行作为一个名叫「内容」的字段
        if (line.trim()) out['内容'] = line.trim();
        continue;
      }
      out[line.slice(0, idx2).trim()] = line.slice(idx2 + 1).trim();
      continue;
    }
    const k = line.slice(0, idx).trim();
    if (k) out[k] = line.slice(idx + 1).trim();
  }
  return out;
}

// —— 分拣：按条件保留条目 ——
export function runFilter(
  value: unknown,
  opts: { keyword: string; mode: 'contains' | 'notContains' | 'startsWith' | 'endsWith' },
): string[] {
  const list = toList(value);
  const kw = opts.keyword;
  if (!kw) return list;
  switch (opts.mode) {
    case 'contains':
      return list.filter((s) => s.includes(kw));
    case 'notContains':
      return list.filter((s) => !s.includes(kw));
    case 'startsWith':
      return list.filter((s) => s.startsWith(kw));
    case 'endsWith':
      return list.filter((s) => s.endsWith(kw));
  }
}

// —— 排序 ——
export function runSort(
  value: unknown,
  opts: { by: 'text' | 'length' | 'number'; order: 'asc' | 'desc' },
): string[] {
  const list = [...toList(value)];
  const dir = opts.order === 'desc' ? -1 : 1;
  const score = (s: string): number | string => {
    if (opts.by === 'length') return s.length;
    if (opts.by === 'number') {
      const n = Number(s.replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    return s;
  };
  return list.sort((a, b) => {
    const x = score(a);
    const y = score(b);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'zh') * dir;
  });
}

// —— 只要前几条 ——
export function runLimit(
  value: unknown,
  opts: { count: number; from: 'head' | 'tail' },
): string[] {
  const list = toList(value);
  const n = Math.max(0, Math.floor(Number(opts.count) || 0));
  if (n === 0) return list;
  return opts.from === 'tail' ? list.slice(-n) : list.slice(0, n);
}

// —— 去掉重复 ——
export function runRemoveDuplicates(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of toList(value)) {
    const key = s.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// —— 分成多条 / 聚成一组 ——
export function runSplitOut(value: unknown, separator: string): string[] {
  if (separator) {
    const text = typeof value === 'string' ? value : toList(value).join('\n');
    return text
      .split(separator)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return toList(value);
}

export function runAggregate(value: unknown, separator: string): string {
  return toList(value).join(separator);
}

// —— 算一算 ——
export type SummaryOp = 'count' | 'sum' | 'average' | 'max' | 'min' | 'join' | 'unique';

export function runSummarize(
  value: unknown,
  opts: { op: SummaryOp; separator: string },
): { result: string; count: number } {
  const list = toList(value);
  const nums = list.map((s) => Number(s.replace(/[^0-9.\-]/g, ''))).filter((n) => Number.isFinite(n));
  switch (opts.op) {
    case 'count':
      return { result: String(list.length), count: list.length };
    case 'sum': {
      const s = nums.reduce((a, b) => a + b, 0);
      return { result: fmt(s), count: list.length };
    }
    case 'average': {
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      return { result: fmt(avg), count: list.length };
    }
    case 'max':
      return { result: nums.length ? fmt(Math.max(...nums)) : '0', count: list.length };
    case 'min':
      return { result: nums.length ? fmt(Math.min(...nums)) : '0', count: list.length };
    case 'unique':
      return { result: String(new Set(list.map((s) => s.trim())).size), count: list.length };
    case 'join':
      return { result: list.join(opts.separator || '\n'), count: list.length };
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10000) / 10000);
}

// —— 挑出想要的字段 / 改字段名 ——
export function runPickFields(
  value: unknown,
  opts: { fields: string; missing: 'empty' | 'skip' },
): Record<string, string> {
  const src = parseLooseObject(value);
  const wanted = opts.fields
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: Record<string, string> = {};
  for (const f of wanted) {
    if (f in src) {
      out[f] = src[f];
    } else if (opts.missing === 'empty') {
      out[f] = '';
    }
  }
  return out;
}

export function runRenameKeys(
  value: unknown,
  mapping: string,
): Record<string, string> {
  const src = parseLooseObject(value);
  // mapping 形如「旧名=新名」，每行一条
  const pairs: [string, string][] = [];
  for (const line of mapping.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const idx = t.indexOf('=');
    if (idx === -1) {
      const idx2 = t.indexOf('：');
      if (idx2 === -1) continue;
      pairs.push([t.slice(0, idx2).trim(), t.slice(idx2 + 1).trim()]);
      continue;
    }
    pairs.push([t.slice(0, idx).trim(), t.slice(idx + 1).trim()]);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    const hit = pairs.find(([from]) => from === k);
    out[hit ? hit[1] : k] = v;
  }
  return out;
}

/** 把对象渲染成给人看的多行文本 */
export function renderObject(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}：${v}`)
    .join('\n');
}
