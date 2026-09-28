// ============================================================
// 云端保管箱：把私密信息（钥匙、地址等）集中存在你自己的 Supabase 里
//
// 为什么不用官方 SDK：这个项目一直是「零额外依赖」的风格，
// 而 Supabase 的读写本身就是几个普通的 HTTP 请求，用原生 fetch 足够，
// 不必为此多背上一个客户端库。
//
// 一句实话：这个应用整个跑在浏览器里，钥匙在运行时必然处在浏览器内存中。
// 保管箱能解决的是「集中在一处、换台电脑也能用」，解决不了「前端拿得到」。
// 所以下面的每一处失败提示，都尽量把「为什么失败、下一步做什么」说清楚。
// ============================================================

import type { VaultItem, VaultSettings, VaultKind } from '../types';

/** 保管箱里的表名 */
const TABLE = 'vault_items';

/** 一次请求最多等多久（毫秒） */
const TIMEOUT_MS = 15000;

/** 把用户填的保管箱地址整理干净：去掉末尾斜杠、补上 https */
function normalizeUrl(raw: string): string {
  const t = (raw ?? '').trim();
  if (!t) return '';
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  return withProto.replace(/\/+$/, '');
}

/** 保管箱没配好时，统一从这里报错，文案保持人话 */
function assertConfigured(cfg: VaultSettings): { base: string; key: string } {
  const base = normalizeUrl(cfg?.url);
  const key = (cfg?.key ?? '').trim();
  if (!base) {
    throw new Error('还没填保管箱地址。在设置里填上你那串以 supabase.co 结尾的地址就行。');
  }
  if (!key) {
    throw new Error('还没填开启保管箱的钥匙。在设置里把 Supabase 给你的那串长密码填进去。');
  }
  return { base, key };
}

/** 把网络层的异常翻成人话 */
function humanize(e: unknown): Error {
  if (e instanceof Error && e.name === 'AbortError') {
    return new Error('等太久了，保管箱一直没回话。检查一下网络，或者地址是不是填错了。');
  }
  if (e instanceof Error && e.name === 'TypeError') {
    return new Error(
      '连不上保管箱。多数是地址填错了，或者这个地址不允许网页直接访问。\n' +
        '地址应该是形如 https://xxxxx.supabase.co 这样的一串。',
    );
  }
  if (e instanceof Error) return e;
  return new Error(`和保管箱打交道时出了点问题：${String(e)}`);
}

/** 按状态码把失败原因说清楚 —— 这是用户最容易卡住的地方 */
function explainStatus(status: number, detail: string): Error {
  if (status === 401 || status === 403) {
    return new Error('保管箱不认这把钥匙。可能是钥匙抄错了，或者抄的时候少了几个字符。');
  }
  if (status === 404) {
    return new Error(
      '保管箱里没找到存放私密信息的那张表。\n' +
        '你可能还没建表 —— 按说明把那段建表语句在 Supabase 里执行一次就好了。',
    );
  }
  if (status === 409) {
    return new Error('这条信息已经存过了，名字和别人重复。换个名字再存。');
  }
  if (status >= 500) {
    return new Error('保管箱自己出错了，稍等一会儿再试。');
  }
  const extra = detail ? `（${detail}）` : '';
  return new Error(`保管箱没接受这次操作${extra}。`);
}

/** 发一次请求，统一处理超时、状态码与错误文案 */
async function request(
  cfg: VaultSettings,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const { base, key } = assertConfigured(cfg);
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(`${base}${path}`, {
      ...init,
      signal: ac.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (e) {
    clearTimeout(to);
    throw humanize(e);
  }
  clearTimeout(to);

  const text = await resp.text();
  if (!resp.ok) {
    // Supabase 的报错体是一个 { message, hint, details } 的 JSON
    let detail = '';
    try {
      const j = JSON.parse(text) as { message?: string };
      detail = j?.message ?? '';
    } catch {
      /* 不是 JSON 就算了，不重要 */
    }
    throw explainStatus(resp.status, detail);
  }

  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 云端那一行的原始形状（列名与建表语句一致） */
interface VaultRow {
  id: string;
  name: string;
  kind: string;
  payload: unknown;
  is_default: boolean;
}

function rowToItem(r: VaultRow): VaultItem {
  const kind: VaultKind =
    r.kind === 'ai_service' || r.kind === 'web_reader' || r.kind === 'other' ? r.kind : 'other';
  const payload =
    r.payload && typeof r.payload === 'object' ? (r.payload as Record<string, unknown>) : {};
  return { id: r.id, name: r.name, kind, payload, is_default: r.is_default };
}

/** 把保管箱里的东西全取出来 */
export async function listVaultItems(cfg: VaultSettings): Promise<VaultItem[]> {
  const rows = (await request(cfg, `/rest/v1/${TABLE}?select=*&order=created_at.asc`)) as
    | VaultRow[]
    | undefined;
  if (!Array.isArray(rows)) return [];
  return rows.map(rowToItem);
}

/**
 * 存一条进去。有 id 就是改，没 id 就是新建。
 * 用 upsert 而不是先查后写，少一次往返、也少一类竞态。
 */
export async function upsertVaultItem(
  cfg: VaultSettings,
  item: VaultItem,
): Promise<VaultItem> {
  const body: Record<string, unknown> = {
    name: item.name,
    kind: item.kind,
    payload: item.payload,
    is_default: item.is_default ?? false,
    updated_at: new Date().toISOString(),
  };
  if (item.id) body.id = item.id;

  const rows = (await request(cfg, `/rest/v1/${TABLE}?select=*`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body),
  })) as VaultRow[] | undefined;

  if (Array.isArray(rows) && rows[0]) return rowToItem(rows[0]);
  // 对方没回内容也当作成功，返回一个带原 id 的副本即可
  return item;
}

/** 删掉一条 */
export async function deleteVaultItem(cfg: VaultSettings, id: string): Promise<void> {
  await request(cfg, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * 试试保管箱能不能用。
 * 返回一句可以径直显示给用户的人话；成功时不抛错，失败时抛出带说明的错误。
 */
export async function testVaultConnection(cfg: VaultSettings): Promise<string> {
  const items = await listVaultItems(cfg);
  return items.length
    ? `保管箱通了，里面已经存了 ${items.length} 条信息。`
    : '保管箱通了。里面还是空的，存一条试试。';
}
