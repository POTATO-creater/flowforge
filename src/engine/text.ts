// ============================================================
// 文字处理 / 日期时间 / 编码 类节点的实现
//
// 对应 n8n 的 Markdown / HTML / XML / Date & Time / Crypto /
// TOTP / JWT 等核心节点。全部用浏览器自带能力实现，不引第三方依赖：
//   - HTML / XML 用浏览器自带的 DOMParser
//   - 加密哈希、HMAC、签发令牌 用浏览器自带的 Web Crypto（crypto.subtle）
// 因此这些节点在浏览器里能 100% 跑通。
// ============================================================

// ============================================================
// 一、文字处理
// ============================================================

/** 简单的 Markdown → HTML（够用即可，不追求完整规范） */
export function markdownToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      closeList();
      continue;
    }
    // 标题
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lv = h[1].length;
      out.push(`<h${lv}>${inline(esc(h[2]))}</h${lv}>`);
      continue;
    }
    // 无序列表
    const li = t.match(/^[-*+]\s+(.*)$/);
    if (li) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(esc(li[1]))}</li>`);
      continue;
    }
    // 引用
    const bq = t.match(/^>\s?(.*)$/);
    if (bq) {
      closeList();
      out.push(`<blockquote>${inline(esc(bq[1]))}</blockquote>`);
      continue;
    }
    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      closeList();
      out.push('<hr />');
      continue;
    }
    closeList();
    out.push(`<p>${inline(esc(t))}</p>`);
  }
  closeList();
  return out.join('\n');
}

/** 行内标记：粗体、斜体、行内代码、链接 */
function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** HTML → Markdown（够用即可） */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return nodeToMd(doc.body).replace(/\n{3,}/g, '\n\n').trim();
}

function nodeToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\s+/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const kids = Array.from(el.childNodes).map(nodeToMd).join('');

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `\n${'#'.repeat(Number(tag[1]))} ${kids.trim()}\n\n`;
    case 'p':
      return `\n${kids.trim()}\n\n`;
    case 'br':
      return '\n';
    case 'strong':
    case 'b':
      return `**${kids.trim()}**`;
    case 'em':
    case 'i':
      return `*${kids.trim()}*`;
    case 'code':
      return `\`${kids.trim()}\``;
    case 'pre':
      return `\n\`\`\`\n${el.textContent?.trim() ?? ''}\n\`\`\`\n`;
    case 'a':
      return `[${kids.trim()}](${el.getAttribute('href') ?? ''})`;
    case 'li':
      return `- ${kids.trim()}\n`;
    case 'ul':
    case 'ol':
      return `\n${kids}\n`;
    case 'blockquote':
      return `\n> ${kids.trim()}\n\n`;
    case 'hr':
      return '\n---\n\n';
    case 'script':
    case 'style':
      return '';
    default:
      return kids;
  }
}

/** 从 HTML 里按选择器提取内容 */
export function extractHtml(
  html: string,
  opts: { selector: string; attr: string },
): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!opts.selector.trim()) return doc.body.textContent?.trim() ?? '';
  const nodes = doc.querySelectorAll(opts.selector);
  const parts: string[] = [];
  nodes.forEach((n) => {
    if (opts.attr.trim()) {
      parts.push(n.getAttribute(opts.attr) ?? '');
    } else {
      parts.push((n.textContent ?? '').trim());
    }
  });
  return parts.filter(Boolean).join('\n');
}

/** HTML → 纯文字 */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style').forEach((n) => n.remove());
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

/** XML → 对象（简化：把标签拼成 JSON 结构） */
export function xmlToObject(xml: string): unknown {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('这段内容不是合法的数据格式，读不出来。');
  return elementToObj(doc.documentElement);
}

function elementToObj(el: Element): unknown {
  const children = Array.from(el.children);
  if (children.length === 0) {
    return el.textContent?.trim() ?? '';
  }
  const obj: Record<string, unknown> = {};
  for (const c of children) {
    const key = c.tagName;
    const val = elementToObj(c);
    if (key in obj) {
      const cur = obj[key];
      if (Array.isArray(cur)) cur.push(val);
      else obj[key] = [cur, val];
    } else {
      obj[key] = val;
    }
  }
  return obj;
}

/** 对象 → XML */
export function objectToXml(value: unknown, rootName = 'root'): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const walk = (v: unknown, name: string): string => {
    if (v == null) return `<${name} />`;
    if (Array.isArray(v)) return v.map((x) => walk(x, name)).join('');
    if (typeof v === 'object') {
      const inner = Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => walk(x, k))
        .join('');
      return `<${name}>${inner}</${name}>`;
    }
    return `<${name}>${esc(String(v))}</${name}>`;
  };
  return walk(value, rootName);
}

/** 查找替换（支持正则） */
export function runFindReplace(
  text: string,
  opts: { find: string; replace: string; regex: boolean; all: boolean; ignoreCase: boolean },
): { result: string; count: number } {
  if (!opts.find) return { result: text, count: 0 };
  let re: RegExp;
  try {
    const source = opts.regex ? opts.find : escapeRegExp(opts.find);
    re = new RegExp(source, opts.all ? (opts.ignoreCase ? 'gi' : 'g') : opts.ignoreCase ? 'i' : '');
  } catch {
    throw new Error('「要查找的内容」写得不太对，检查一下是不是有特殊符号。');
  }
  let count = 0;
  const result = opts.all
    ? text.replace(re, () => {
        count++;
        return opts.replace;
      })
    : (() => {
        const m = text.match(re);
        if (!m) return text;
        count = 1;
        return text.replace(re, opts.replace);
      })();
  return { result, count };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 切一段出来 */
export function runSlice(
  text: string,
  opts: { from: number; to: number; bySeparator: boolean; separator: string; index: number },
): string {
  if (opts.bySeparator) {
    const parts = text.split(opts.separator || '\n');
    const i = Math.floor(Number(opts.index) || 0);
    if (i < 0 || i >= parts.length) {
      throw new Error(`按「${opts.separator || '换行'}」切开后一共 ${parts.length} 段，没有第 ${i + 1} 段。`);
    }
    return parts[i].trim();
  }
  const a = Math.max(0, Math.floor(Number(opts.from) || 0));
  const b = opts.to === 0 ? undefined : Math.floor(Number(opts.to));
  return b == null ? text.slice(a) : text.slice(a, b);
}

// ============================================================
// 二、日期时间
// ============================================================

export type DateOp = 'now' | 'format' | 'add' | 'diff' | 'weekday';

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function runDateTime(
  input: string,
  opts: {
    op: DateOp;
    inputFormat: 'auto' | 'timestamp';
    format: string;
    amount: number;
    unit: 'day' | 'hour' | 'minute' | 'month' | 'year';
    target: string;
  },
): string {
  const base = opts.op === 'now' ? new Date() : parseDate(input, opts.inputFormat);

  switch (opts.op) {
    case 'now':
    case 'format':
      return formatDate(base, opts.format);
    case 'weekday':
      return WEEKDAYS[base.getDay()];
    case 'add': {
      const d = new Date(base.getTime());
      const n = Number(opts.amount) || 0;
      if (opts.unit === 'day') d.setDate(d.getDate() + n);
      else if (opts.unit === 'hour') d.setHours(d.getHours() + n);
      else if (opts.unit === 'minute') d.setMinutes(d.getMinutes() + n);
      else if (opts.unit === 'month') d.setMonth(d.getMonth() + n);
      else if (opts.unit === 'year') d.setFullYear(d.getFullYear() + n);
      return formatDate(d, opts.format);
    }
    case 'diff': {
      const other = parseDate(opts.target, 'auto');
      const ms = other.getTime() - base.getTime();
      const days = Math.round(ms / 86400000);
      return String(days);
    }
  }
}

function parseDate(input: string, mode: 'auto' | 'timestamp'): Date {
  const t = (input ?? '').trim();
  if (!t) throw new Error('这个节点需要有内容才能算，请先接上前面节点的结果。');
  if (mode === 'timestamp') {
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error('这不是一个时间戳，换一种读法试试。');
    // 10 位按秒算，13 位按毫秒算
    return new Date(t.length <= 10 ? n * 1000 : n);
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`读不出这是哪一天：「${t}」。常见的写法像 2026-01-31 或 2026/01/31 15:30。`);
  }
  return d;
}

function formatDate(d: Date, format: string): string {
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  const fmt = format || 'YYYY-MM-DD HH:mm:ss';
  return fmt
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, p(d.getMonth() + 1))
    .replace(/DD/g, p(d.getDate()))
    .replace(/HH/g, p(d.getHours()))
    .replace(/mm/g, p(d.getMinutes()))
    .replace(/ss/g, p(d.getSeconds()))
    .replace(/MMM/g, String(d.getMonth() + 1));
}

/** 取当前时间，供「日期时间」节点在不用输入时使用 */
export function nowFormatted(format: string): string {
  return formatDate(new Date(), format);
}

// ============================================================
// 三、编码与加密（浏览器自带 Web Crypto）
// ============================================================

const enc = new TextEncoder();

/**
 * 转成 Web Crypto 需要的二进制类型。
 * 直接传 Uint8Array 在新版类型定义下会因 ArrayBufferLike 不收；
 * 显式取 .buffer 并切出对应片段即可。
 */
function toBuf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** 哈希：SHA-1 / SHA-256 / SHA-384 / SHA-512 */
export async function runHash(text: string, algo: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'): Promise<string> {
  const digest = await crypto.subtle.digest(algo, toBuf(enc.encode(text)));
  return bufToHex(digest);
}

/** HMAC：带密钥的签名 */
export async function runHmac(
  text: string,
  key: string,
  algo: 'SHA-256' | 'SHA-384' | 'SHA-512',
): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    toBuf(enc.encode(key)),
    { name: 'HMAC', hash: algo },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, toBuf(enc.encode(text)));
  return bufToHex(sig);
}

/** 生成随机字符串 */
export function runRandom(length: number, kind: 'alnum' | 'hex' | 'number'): string {
  const n = Math.max(1, Math.min(4096, Math.floor(Number(length) || 16)));
  const pools = {
    alnum: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    hex: '0123456789abcdef',
    number: '0123456789',
  } as const;
  const pool = pools[kind];
  const bytes = new Uint32Array(n);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < n; i++) out += pool[bytes[i] % pool.length];
  return out;
}

/** Base64 / URL 编码转换 */
export function runEncode(
  text: string,
  opts: { op: 'b64enc' | 'b64dec' | 'urlenc' | 'urldec' | 'htmlenc' | 'htmldec' },
): string {
  switch (opts.op) {
    case 'b64enc':
      // 先转 UTF-8 再编码，中文才不会乱码
      return btoa(String.fromCharCode(...new Uint8Array(enc.encode(text))));
    case 'b64dec': {
      const bin = atob(text.trim());
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    case 'urlenc':
      return encodeURIComponent(text);
    case 'urldec':
      return decodeURIComponent(text);
    case 'htmlenc':
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    case 'htmldec': {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      return doc.body.textContent ?? '';
    }
  }
}

// ============================================================
// 四、动态口令（TOTP）与令牌（JWT）
// ============================================================

/** Base32 解码（动态口令的密钥用这种写法） */
function base32Decode(s: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error(`口令密钥里出现了不认识的字符「${ch}」。密钥一般是一串大写字母和 2-7 的数字。`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** 生成 6 位（或指定位数）动态口令，30 秒一换 */
export async function runTotp(
  secret: string,
  opts: { digits: number; period: number; algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512' },
): Promise<{ code: string; secondsLeft: number }> {
  const keyBytes = base32Decode(secret);
  if (keyBytes.length === 0) throw new Error('还没填口令密钥。密钥一般是一串大写字母和数字。');

  const period = Math.max(1, Number(opts.period) || 30);
  const digits = Math.max(4, Math.min(10, Number(opts.digits) || 6));
  const counter = Math.floor(Date.now() / 1000 / period);

  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    toBuf(keyBytes),
    { name: 'HMAC', hash: opts.algorithm },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, toBuf(msg)));

  const offset = sig[sig.length - 1] & 0x0f;
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  const code = String(binary % 10 ** digits).padStart(digits, '0');
  const secondsLeft = period - (Math.floor(Date.now() / 1000) % period);
  return { code, secondsLeft };
}

/** 令牌：解析，或签发一个 */
export async function runJwt(
  token: string,
  opts: { op: 'decode' | 'sign'; secret: string; payload: string },
): Promise<string> {
  if (opts.op === 'decode') {
    const parts = token.trim().split('.');
    if (parts.length < 2) throw new Error('这不是一个完整的令牌，应该有「.」分隔的好几段。');
    const payload = JSON.parse(b64urlDecode(parts[1]));
    return JSON.stringify(payload, null, 2);
  }

  // 签发 HS256 令牌
  if (!opts.secret) throw new Error('签发令牌需要一个密钥，请先填上。');
  let payload: unknown;
  try {
    payload = JSON.parse(opts.payload || '{}');
  } catch {
    throw new Error('「令牌内容」写得不是合法格式，检查一下逗号和引号。');
  }
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const key = await crypto.subtle.importKey(
    'raw',
    toBuf(enc.encode(opts.secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, toBuf(enc.encode(data)));
  return `${data}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

function b64urlEncode(s: string): string {
  return b64urlFromBytes(new Uint8Array(enc.encode(s)));
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** 供内部复用：把 ArrayBuffer 转 Base64（保留） */
export { bufToBase64 };
