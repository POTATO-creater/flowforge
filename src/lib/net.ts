// ============================================================
// 网络访问层：统一处理「浏览器跨域限制」
//
// 背景：这个应用整个跑在浏览器里，没有服务器。浏览器有个安全规则：
// 如果一个网站没有明确说「允许别的网页读我的内容」，网页就【读不到】
// 它的返回结果（这就是所谓的跨域/CORS 拦截）。
//
// 实测发现这件事很不可靠：同样是「免密钥公开接口」，
//   - hacker-news.firebaseio.com  → 允许（返回 access-control-allow-origin: *）
//   - api.open-meteo.com（天气）   → 不允许
//   - date.nager.at（节假日）      → 不允许
// 所以不能凭「看起来是公开接口」就假设能直连。
//
// 本模块的对策：给每次请求三种策略，并在直连失败时自动降级走中转，
// 同时把「为什么失败、下一步能做什么」翻成人话告诉用户。
// ============================================================

/** 访问策略 */
export type CorsMode =
  /** 确定能直连（实测过有跨域许可），不走中转 */
  | 'direct'
  /** 必须走中转（对方没有跨域许可） */
  | 'proxy'
  /** 先试直连，被拦了自动改走中转（默认，最省事） */
  | 'either';

/** 默认中转前缀：r.jina.ai 是一个只读文本代理，能把网页转成干净文字 */
export const DEFAULT_PROXY = 'https://r.jina.ai/';

export interface NetRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  /** 访问策略，默认 either */
  cors?: CorsMode;
  /** 超时（秒） */
  timeout?: number;
  signal?: AbortSignal;
}

export interface NetResult {
  status: number;
  /** 返回的原始文本 */
  text: string;
  /** 若是合法 JSON 则给出解析结果 */
  json?: unknown;
  /** 实际用的是哪个地址（走中转时能看出来） */
  usedUrl: string;
  /** 是否走了中转 */
  viaProxy: boolean;
  /** 若直连被拦而改用了中转，这里给出说明（用于日志） */
  note?: string;
}

/** 把用户填的中转地址标准化：允许留空 */
function normalizeProxy(proxy: string | undefined): string {
  const p = (proxy ?? '').trim();
  if (!p) return '';
  return p.endsWith('/') ? p : `${p}/`;
}

/** 把目标网址拼到中转前缀后面（r.jina.ai 风格：前缀 + 完整网址） */
function withProxy(proxy: string, url: string): string {
  return proxy + url;
}

/** 判断一个异常是不是「被浏览器跨域拦了」 */
function isCorsLike(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  // 浏览器出于安全，跨域失败时统一报得很含糊，只能靠这几种特征判断
  const msg = e.message.toLowerCase();
  return (
    e.name === 'TypeError' &&
    (msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('load failed'))
  );
}

/** 把网络类错误翻成人话，并给出下一步该干什么 */
export function humanizeNetworkError(e: unknown, url: string, hadProxy: boolean): Error {
  if (e instanceof Error && e.name === 'AbortError') {
    return new Error(`等太久了还没回来（地址：${url}）。要么对方太慢，要么网址不对。`);
  }
  if (isCorsLike(e)) {
    if (hadProxy) {
      return new Error(
        `连中转也没能拿到这个网址的内容：${url}。\n` +
          `可能是中转地址填得不对，或者这个网址需要登录才能看。`,
      );
    }
    return new Error(
      `这个网站不允许网页直接读它的内容（浏览器的安全规则）。\n` +
        `可以点右上角齿轮打开设置，在「网络中转」里填一个中转地址再试。`,
    );
  }
  if (e instanceof Error) return e;
  return new Error(`访问这个网址时出了点问题：${url}。${String(e)}`);
}

/** 发一次请求（不带降级逻辑），供内部使用 */
async function once(
  url: string,
  req: NetRequest,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  const timer = new AbortController();
  const onAbort = () => timer.abort();
  req.signal?.addEventListener('abort', onAbort);
  const to = setTimeout(() => timer.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: req.method ?? 'GET',
      headers: req.headers,
      body: req.method && req.method !== 'GET' ? req.body : undefined,
      signal: timer.signal,
    });
    const text = await resp.text();
    return { status: resp.status, text };
  } finally {
    clearTimeout(to);
    req.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * 按策略访问一个网址。这是所有网络节点统一走的口子。
 *
 * @param proxy 用户在设置里填的中转地址（可为空）
 */
export async function fetchSmart(
  req: NetRequest,
  proxy: string | undefined,
): Promise<NetResult> {
  const mode: CorsMode = req.cors ?? 'either';
  const proxyPrefix = normalizeProxy(proxy);
  const timeoutMs = Math.max(3, Number(req.timeout) || 30) * 1000;

  const direct = async (): Promise<NetResult> => {
    const { status, text } = await once(req.url, req, timeoutMs);
    return { status, text, json: tryJson(text), usedUrl: req.url, viaProxy: false };
  };

  const viaProxy = async (note?: string): Promise<NetResult> => {
    const target = withProxy(proxyPrefix, req.url);
    const { status, text } = await once(target, { ...req }, timeoutMs);
    return {
      status,
      text,
      json: tryJson(text),
      usedUrl: target,
      viaProxy: true,
      note,
    };
  };

  // 明确要求走中转
  if (mode === 'proxy') {
    if (!proxyPrefix) {
      throw new Error(
        `这个节点需要通过中转才能访问：${req.url}。\n` +
          `请点右上角齿轮打开设置，在「网络中转」里填一个中转地址。`,
      );
    }
    try {
      return await viaProxy();
    } catch (e) {
      throw humanizeNetworkError(e, req.url, true);
    }
  }

  // 明确能直连
  if (mode === 'direct') {
    try {
      return await direct();
    } catch (e) {
      throw humanizeNetworkError(e, req.url, false);
    }
  }

  // either：先直连，被拦了自动改走中转
  try {
    return await direct();
  } catch (e) {
    const blocked = isCorsLike(e);
    if (!blocked) throw humanizeNetworkError(e, req.url, false);

    if (!proxyPrefix) {
      // 没有中转可用，把「怎么办」说清楚
      throw humanizeNetworkError(e, req.url, false);
    }
    const note = '直连被浏览器拦了，已自动改用中转';
    try {
      return await viaProxy(note);
    } catch (e2) {
      throw humanizeNetworkError(e2, req.url, true);
    }
  }
}

function tryJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}
