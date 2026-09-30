// ============================================================
// 自家的 Markdown 渲染：AI 答案的排版
//
// 为什么不用现成的库、也不拼 HTML 字符串：
//   - 库：动辄几十 KB，我们只用到常用的一小半语法，不值当；
//   - 拼 HTML 再塞 innerHTML：AI 的输出里可能带着恶意代码，
//     一不小心就被注入。而 React 元素树从根上没有这个问题 ——
//     所有文字都只是「文字」，浏览器不会把它当代码执行。
//
// 支持的写法（都是 AI 爱用的）：
//   # 标题        **粗体**        *斜体*        `行内代码`
//   - 列表        1. 列表         > 引用        --- 分隔线
//   [文字](网址)  裸网址自动可点   ``` 代码块 ```  | 表格 |
// ============================================================
import { createElement as h, Fragment } from 'react';
import type { ReactNode } from 'react';

/** 把一段 Markdown 文本渲染成 React 元素 */
export function renderMarkdown(src: string): ReactNode {
  if (!src) return null;
  return h(Fragment, null, ...splitBlocks(src.replace(/\r\n/g, '\n')));
}

// ============================================================
// 一、块级：一段文本切成 标题/段落/列表/表格/代码块…
// ============================================================

function splitBlocks(src: string): ReactNode[] {
  const lines = src.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const k = () => `b${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    // —— 代码块：``` 开到 ``` 止 ——
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // 收尾那行 ```（没有也无所谓）
      out.push(
        h('pre', { key: k(), className: 'md__pre', 'data-lang': lang || undefined },
          h('code', null, buf.join('\n')),
        ),
      );
      continue;
    }

    // —— 标题：# ~ ###### ——
    // AI 输出里的 # 通常当「小节名」用，压两级渲染，避免顶出特大字
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6);
      const tag = `h${level}` as 'h3' | 'h4' | 'h5' | 'h6';
      out.push(h(tag, { key: k(), className: 'md__h' }, ...inline(heading[2])));
      i++;
      continue;
    }

    // —— 分隔线：--- 或 *** ——
    if (/^\s*([-*_])(\s*\1)+\s*$/.test(line)) {
      out.push(h('hr', { key: k(), className: 'md__hr' }));
      i++;
      continue;
    }

    // —— 引用：> 开头的行 ——
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(h('blockquote', { key: k(), className: 'md__quote' }, ...inline(buf.join('\n'))));
      continue;
    }

    // —— 表格：| a | b | 加一行 |---|---| ——
    if (
      /^\s*\|.*\|\s*$/.test(line) &&
      i + 1 < lines.length &&
      /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])
    ) {
      const parseRow = (l: string) =>
        l
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const head = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|?\s*$/.test(lines[i]) && lines[i].includes('|')) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      out.push(
        h('table', { key: k(), className: 'md__table' },
          h('thead', null,
            h('tr', null, ...head.map((c, j) => h('th', { key: j }, ...inline(c)))),
          ),
          h('tbody', null,
            ...rows.map((r, ri) =>
              h('tr', { key: ri }, ...r.map((c, ci) => h('td', { key: ci }, ...inline(c)))),
            ),
          ),
        ),
      );
      continue;
    }

    // —— 列表：- / * / 1. 开头的行 ——
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
        i++;
        // 缩进的续行算作上一条的延续
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        }
      }
      const Tag = (ordered ? 'ol' : 'ul') as 'ol' | 'ul';
      out.push(
        h(Tag, { key: k(), className: 'md__list' },
          ...items.map((it, j) => h('li', { key: j }, ...inline(it))),
        ),
      );
      continue;
    }

    // —— 空行：分段 ——
    if (!line.trim()) {
      i++;
      continue;
    }

    // —— 普通段落：连续的非空行 ——
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !/^\s*\|.*\|\s*$/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(h('p', { key: k(), className: 'md__p' }, ...inline(buf.join('\n'))));
  }

  return out;
}

// ============================================================
// 二、行内：粗体 / 斜体 / 代码 / 链接
// ============================================================

/**
 * 一个正则同时认五种行内写法，按序号区分：
 *   1-2  **粗体**
 *   3-4  `行内代码`
 *   5-6  *斜体*
 *   7-9  [文字](网址)
 *   10   裸网址
 */
const INLINE_RE =
  /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\*([^*\n]+)\*)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s<>()\[\]]+)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let key = 0;

  // 先按换行拆开，段落内的手动换行保留下来
  text.split('\n').forEach((seg, li) => {
    if (li > 0) out.push(h('br', { key: `br${li}` }));
    let last = 0;
    for (const m of seg.matchAll(INLINE_RE)) {
      const idx = m.index ?? 0;
      if (idx > last) out.push(seg.slice(last, idx));
      if (m[1]) {
        out.push(h('strong', { key: key++ }, m[2]));
      } else if (m[3]) {
        out.push(h('code', { key: key++, className: 'md__code' }, m[4]));
      } else if (m[5]) {
        out.push(h('em', { key: key++ }, m[6]));
      } else if (m[7]) {
        // 链接：只放行 http/https（正则里已保证），新标签打开、不带回来源
        out.push(
          h('a', { key: key++, href: m[9], target: '_blank', rel: 'noreferrer' }, m[8]),
        );
      } else if (m[10]) {
        out.push(
          h('a', { key: key++, href: m[10], target: '_blank', rel: 'noreferrer' }, m[10]),
        );
      }
      last = idx + m[0].length;
    }
    if (last < seg.length) out.push(seg.slice(last));
  });

  return out;
}
