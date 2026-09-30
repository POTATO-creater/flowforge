// ============================================================
// 读网页（魔搭）：借用魔搭广场上托管的「网页抓取」服务把网页读成正文
//
// 背景（说人话）：
//   魔搭社区（ModelScope）的广场上提供了一些「现成的小服务」，
//   其中一个专门负责把一个网址读成干净的文字（正文）。
//   我们这个应用是纯浏览器应用，可以直接连过去用它。
//
// 技术上它用的是「服务器推流」的通信方式：先建立一条长连接，
// 对方会先告诉我们「后续要往哪个地址发指令」，我们再依次发
// 「打个招呼」→「问有哪些功能」→「请读这个网址」，结果会从
// 刚才那条长连接里推回来。
//
// ⚠️ 重要：本项目其它网络请求都走 lib/net.ts 的 fetchSmart，
//   但那个是「等整个响应读完才返回」，处理不了这种一直不结束的
//   长连接，所以这里必须单独实现。
// ============================================================

import { parseSseFrame, type SseFrame } from '../lib/sse';

/**
 * 内置的默认阅读器地址（魔搭广场上的「Fetch 网页内容抓取」）。
 * 拖出节点什么都不用填就能用；节点里的「阅读器地址」留空即走这里，
 * 若要换用别的服务，把地址填进节点即可覆盖。
 */
export const DEFAULT_MCP_FETCH_SERVER =
  'https://mcp.api-inference.modelscope.net/ce180b051f2948/sse';

/** 常见「读网页」功能的名称候选，供自动识别失败时逐个试 */
const TOOL_NAME_CANDIDATES = [
  'fetch',
  'fetch_url',
  'fetchUrl',
  'fetch_webpage',
  'get_url',
  'read_url',
  'web_fetch',
];

export interface McpFetchOptions {
  /** 要读的网页地址 */
  url: string;
  /** 最多等多少秒 */
  timeout: number;
  /** 高级：手动指定用哪个功能；留空自动挑 */
  tool?: string;
  /** 高级：换别的阅读器时才填；留空用内置的 */
  server?: string;
  /**
   * 用户在设置里填的「网络中转」地址。
   * 对方站点如果没给跨域许可（实测这个魔搭服务就没给），
   * 浏览器会拦住直连，这时必须经中转绕一下。
   */
  netProxy?: string;
}

export interface McpFetchResult {
  /** 正文纯文本（主字段，下游节点主要用这个） */
  content: string;
  title: string;
  url: string;
  status: number;
  /** 实际用到的功能名，便于排查 */
  tool: string;
  note?: string;
}

// ============================================================
// 一、服务器推流的解析
// （切帧规则在 lib/sse.ts，AI 回答与读网页共用；这里只留长连接的读循环）
// ============================================================

export { parseSseFrame as parseFrame };
export type { SseFrame } from '../lib/sse';

/**
 * 从一条长连接里持续读帧。读到帧就回调 onFrame。
 * 返回一个「取消」函数，调用后断开连接。
 */
async function pumpStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
  onError: (e: unknown) => void,
): Promise<() => void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopped = false;

  const loop = async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || stopped) break;
        buffer += decoder.decode(value, { stream: true });
        // 统一成 \n，再按空行切帧
        buffer = buffer.replace(/\r\n/g, '\n');
        for (;;) {
          const idx = buffer.indexOf('\n\n');
          if (idx === -1) break;
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const frame = parseSseFrame(raw);
          if (frame) onFrame(frame);
        }
      }
    } catch (e) {
      if (!stopped) onError(e);
    }
  };

  void loop();

  return () => {
    stopped = true;
    try {
      void reader.cancel();
    } catch {
      /* 忽略：连接可能已经断了 */
    }
  };
}

// ============================================================
// 二、人话报错
// ============================================================

/** 判断是不是被浏览器的跨域规则拦了（这类错误的表现是同一种） */
function isCorsLike(e: unknown): boolean {
  return (
    e instanceof Error &&
    e.name === 'TypeError' &&
    /failed to fetch|networkerror|load failed|fetch failed/i.test(e.message)
  );
}

function humanize(e: unknown, address: string, hadProxy = false): Error {
  if (e instanceof Error && e.name === 'AbortError') {
    return new Error(
      `等太久了还没回来（地址：${address}）。要么对方太慢，要么网址填得不对。`,
    );
  }
  if (isCorsLike(e)) {
    if (hadProxy) {
      return new Error(
        `连中转也没能连上这个服务（地址：${address}）。\n` +
          '可能是中转地址填得不对，确认一下它能正常访问。',
      );
    }
    return new Error(
      '这个服务不允许网页直接连接（浏览器的安全规则，拦住了）。\n' +
        '可以点右上角齿轮打开设置，在「网络中转」里填一个中转地址再试。',
    );
  }
  if (e instanceof Error) return e;
  return new Error(`连接这个服务时出了点问题：${address}。${String(e)}`);
}

// ============================================================
// 三、与「阅读器」对话
// ============================================================

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  result?: unknown;
  error?: { code?: number; message?: string };
}

/** 一次会话：维护长连接、等待某条消息的回应、发指令 */
class McpSession {
  private postUrl = '';
  private closeStream: (() => void) | null = null;
  private waiting = new Map<number, (msg: JsonRpcMessage) => void>();
  private closed = false;

  constructor(
    private serverUrl: string,
    private timeoutMs: number,
    private signal?: AbortSignal,
    private proxy = '',
  ) {}

  /** 给一个地址套上中转前缀（没填中转就原样返回） */
  private route(url: string): string {
    if (!this.proxy) return url;
    const prefix = this.proxy.endsWith('/') ? this.proxy : `${this.proxy}/`;
    return prefix + url;
  }

  /** 建立长连接，等对方告诉我们「后续往哪发指令」 */
  async connect(): Promise<void> {
    let resp: Response;
    try {
      resp = await fetch(this.route(this.serverUrl), {
        method: 'GET',
        headers: { accept: 'text/event-stream' },
        signal: this.signal,
      });
    } catch (e) {
      throw humanize(e, this.serverUrl, !!this.proxy);
    }

    if (!resp.ok) {
      throw new Error(
        `这个阅读器地址连不上（对方回了 ${resp.status}）。请确认地址是从魔搭复制来的完整地址。`,
      );
    }
    if (!resp.body) {
      throw new Error(
        '这个浏览器不支持持续接收服务推送的内容，换个新版浏览器再试。',
      );
    }

    const endpointReady = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            '对方一直没有按预期回应（没有给出后续要发指令的地址）。请确认阅读器地址填对了。',
          ),
        );
      }, 8000);

      void pumpStream(
        resp.body!,
        (frame) => {
          this.onFrame(frame, () => clearTimeout(timer), resolve, reject);
        },
        (e) => {
          clearTimeout(timer);
          reject(humanize(e, this.serverUrl));
        },
      ).then((cancel) => {
        this.closeStream = cancel;
      });
    });

    await endpointReady;
  }

  private onFrame(
    frame: SseFrame,
    markEndpoint: () => void,
    resolveEndpoint: () => void,
    rejectEndpoint: (e: Error) => void,
  ) {
    // 1) 对方告诉我们「后续往哪发指令」
    if (frame.event === 'endpoint') {
      const path = frame.data.trim();
      if (!path) return;
      try {
        this.postUrl = new URL(path, this.serverUrl).href;
      } catch {
        rejectEndpoint(
          new Error('对方给的后续地址看不懂，可能这个阅读器地址不完整。'),
        );
        return;
      }
      markEndpoint();
      resolveEndpoint();
      return;
    }

    // 2) 普通回应：按编号派发给等待的人
    if (frame.event === 'message' || !frame.event) {
      let msg: JsonRpcMessage;
      try {
        msg = JSON.parse(frame.data) as JsonRpcMessage;
      } catch {
        return; // 心跳或日志，忽略
      }
      if (msg.id !== undefined) {
        const id = Number(msg.id);
        const cb = this.waiting.get(id);
        if (cb) {
          this.waiting.delete(id);
          cb(msg);
        }
      }
    }
  }

  /** 发一条指令；waitForId 给了就等对方的回应 */
  private async send(payload: unknown, waitForId?: number): Promise<JsonRpcMessage | null> {
    if (!this.postUrl) {
      throw new Error('还没和对方建立起联系，稍后再试。');
    }

    const wait = waitForId === undefined
      ? Promise.resolve(null)
      : new Promise<JsonRpcMessage>((resolve, reject) => {
          this.waiting.set(waitForId, resolve);
          setTimeout(() => {
            if (this.waiting.delete(waitForId)) {
              reject(
                new Error('对方收到指令后一直没有回复，可能这个服务正忙。'),
              );
            }
          }, this.timeoutMs);
        });

    try {
      const resp = await fetch(this.route(this.postUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: this.signal,
      });
      // 通知类指令对方只回 202，没有内容，属正常
      if (!resp.ok && waitForId !== undefined) {
        throw new Error(`对方拒绝接收指令（回了 ${resp.status}）。`);
      }
    } catch (e) {
      throw humanize(e, this.serverUrl, !!this.proxy);
    }

    return wait;
  }

  /** 打招呼，完成能力协商 */
  async handshake(): Promise<void> {
    const r = await this.send(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'flowforge', version: '0.1.0' },
        },
      },
      1,
    );
    if (r?.error) {
      throw new Error(`打招呼失败：${r.error.message ?? '对方没说明原因'}。`);
    }
    // 告诉对方「我准备好了」（通知，不用等回应）
    await this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }

  /** 问对方有哪些功能 */
  async listTools(): Promise<string[]> {
    const r = await this.send(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      2,
    );
    if (r?.error) return [];
    const result = r?.result as { tools?: Array<{ name?: string }> } | undefined;
    if (!result?.tools) return [];
    return result.tools
      .map((t) => t?.name)
      .filter((n): n is string => typeof n === 'string' && !!n);
  }

  /** 请对方读一个网址 */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const r = await this.send(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      3,
    );
    if (r?.error) {
      throw new Error(r.error.message ?? '对方说这个指令执行不了。');
    }
    return r?.result;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.closeStream?.();
  }
}

// ============================================================
// 四、从工具返回里提取正文
// ============================================================

/** 工具通常把结果放在 content[0].text 里 */
function extractText(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const r = result as { content?: unknown; isError?: unknown };
  if (r.isError === true) {
    const t = firstTextBlock(r.content);
    throw new Error(t || '对方说这次没能读到网页内容。');
  }
  return firstTextBlock(r.content);
}

function firstTextBlock(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === 'object') {
        const it = item as { type?: string; text?: string };
        if (typeof it.text === 'string' && it.text) return it.text;
      } else if (typeof item === 'string' && item) {
        return item;
      }
    }
  }
  return '';
}

function pickTitle(raw: string): string {
  const t = raw.match(/^Title:\s*(.+)$/m)?.[1] ?? raw.match(/^#\s+(.+)$/m)?.[1];
  return t ? t.trim() : '';
}

/** 工具可能返回纯文字、JSON 字符串、或 {title, content} 对象，统一拆开 */
function parseBody(text: string): { content: string; title: string } {
  const trimmed = text.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const content =
          (obj.content as string) ??
          (obj.text as string) ??
          (obj.markdown as string) ??
          (obj.body as string) ??
          (obj.data as string) ??
          '';
        if (typeof content === 'string' && content.trim()) {
          return {
            content: content.trim(),
            title: typeof obj.title === 'string' ? obj.title : '',
          };
        }
      }
    } catch {
      /* 不是 JSON，按纯文字处理 */
    }
  }

  return { content: trimmed, title: pickTitle(trimmed) };
}

// ============================================================
// 五、对外主函数
// ============================================================

/**
 * 让「阅读器」把一个网页读成正文。
 * 失败时会抛出带人话说明的错误。
 */
export async function mcpFetchPage(
  opts: McpFetchOptions,
  signal?: AbortSignal,
): Promise<McpFetchResult> {
  const target = opts.url.trim();
  if (!target) throw new Error('这个节点还没填要读的网址。');

  // 节点里填了就用填的，留空则用内置的默认阅读器地址
  const server = (opts.server ?? '').trim() || DEFAULT_MCP_FETCH_SERVER;

  const timeoutSec = Math.max(5, Number(opts.timeout) || 30);
  const timeoutMs = timeoutSec * 1000;

  const ctrl = new AbortController();
  const linkAbort = () => ctrl.abort();
  signal?.addEventListener('abort', linkAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const session = new McpSession(server, timeoutMs, ctrl.signal, (opts.netProxy ?? '').trim());

  try {
    await session.connect();
    await session.handshake();

    // 挑一个「读网页」用的功能
    const toolName = await resolveToolName(session, opts.tool);

    // 参数名各家用得不一样，先 url 后 uri 各试一次
    let raw = '';
    try {
      raw = extractText(await session.callTool(toolName, { url: target }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/argument|required|missing|invalid|参数/i.test(msg)) {
        raw = extractText(await session.callTool(toolName, { uri: target }));
      } else {
        throw e;
      }
    }

    const { content, title } = parseBody(raw);
    if (!content) {
      throw new Error('对方没返回正文，可能这个网址需要登录才能看。');
    }

    return {
      content,
      title: title || target,
      url: target,
      status: 200,
      tool: toolName,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', linkAbort);
    session.close();
    ctrl.abort();
  }
}

/** 三级降级：用户指定 → 问对方要功能清单 → 用常见名称逐个试 */
async function resolveToolName(
  session: McpSession,
  preset?: string,
): Promise<string> {
  const wanted = (preset ?? '').trim();
  if (wanted) return wanted;

  let available: string[] = [];
  try {
    available = await session.listTools();
  } catch {
    available = [];
  }

  if (available.length > 0) {
    const exact = available.find((n) => n.toLowerCase() === 'fetch');
    if (exact) return exact;
    const fuzzy = available.find((n) => /fetch|read|scrap|extract/i.test(n));
    if (fuzzy) return fuzzy;
    return available[0];
  }

  // 问不到清单，就用常见名称；后面的调用失败会自然暴露问题
  return TOOL_NAME_CANDIDATES[0];
}

/** 供排查用：列出这个阅读器上都有些什么功能 */
export async function mcpListTools(
  serverUrl: string,
  timeoutSec = 30,
  signal?: AbortSignal,
): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(5, timeoutSec) * 1000);
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true });

  const session = new McpSession(serverUrl, Math.max(5, timeoutSec) * 1000, ctrl.signal);
  try {
    await session.connect();
    await session.handshake();
    return await session.listTools();
  } finally {
    clearTimeout(timer);
    session.close();
    ctrl.abort();
  }
}
