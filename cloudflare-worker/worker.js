/**
 * FlowForge 中转服务（Cloudflare Worker）
 *
 * 作用：FlowForge 是纯网页应用，浏览器有安全规则（同源策略），
 *      不允许网页直接读别的站点的返回内容。这个中转站在中间加一句
 *      「允许读」，并把请求原样转给真正的服务，结果再流式传回来。
 *
 * 用法：
 *   1. 把这个文件的内容粘贴到 Cloudflare 官网的 Worker 编辑器
 *   2. 部署后得到一个形如 https://xxx.workers.dev 的地址
 *   3. 把这个地址填到 FlowForge 右上角齿轮 →「网络中转」里
 *
 * 调用格式（两种都支持，FlowForge 用第一种）：
 *   前缀式：  https://你的中转地址/https://mcp.api-inference.modelscope.net/xxx/sse
 *   参数式：  https://你的中转地址/?url=https://mcp.api-inference.modelscope.net/xxx/sse
 */

// 只允许转发到这个域名，防止被人拿去当任意代理滥用
const ALLOWED_HOST = 'mcp.api-inference.modelscope.net';

// 跨域许可头：这几行就是解决跨域问题的关键
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    // 浏览器在正式请求前会先问一句「能不能跨域」，这里回答「能」
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const incoming = new URL(request.url);

    // 从两种写法里取出真正的目标地址
    const target = extractTarget(incoming);
    if (!target) {
      return json(
        {
          ok: false,
          message:
            '缺少要访问的地址。两种写法都可以：' +
            '/https://目标地址 或 /?url=https://目标地址',
        },
        400,
      );
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return json({ ok: false, message: 'url 参数不是一个有效的地址。' }, 400);
    }

    if (targetUrl.hostname !== ALLOWED_HOST) {
      return json(
        { ok: false, message: `只允许转发到 ${ALLOWED_HOST}，收到的是 ${targetUrl.hostname}。` },
        403,
      );
    }

    // 把请求原样转过去：方法、头、请求体都保留
    const forwarded = new Request(targetUrl.href, {
      method: request.method,
      headers: {
        // 只保留必要的内容协商头；其余（如 Origin）不带，避免对方拒绝
        accept: request.headers.get('accept') ?? '*/*',
        'content-type': request.headers.get('content-type') ?? 'application/json',
      },
      body: request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer(),
      redirect: 'follow',
    });

    let upstream;
    try {
      upstream = await fetch(forwarded);
    } catch (e) {
      return json(
        { ok: false, message: `转发失败：${e instanceof Error ? e.message : String(e)}` },
        502,
      );
    }

    // ⚠️ 关键：直接把上游的 body 交给响应，不读成文本。
    // 这样长连接（服务会一直推内容）才能一有内容就传回浏览器，不会被卡住。
    const headers = new Headers();
    const passThrough = ['content-type', 'cache-control'];
    for (const name of passThrough) {
      const v = upstream.headers.get(name);
      if (v) headers.set(name, v);
    }
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    headers.set('X-Upstream-Status', String(upstream.status));

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

/**
 * 从进来的地址里取出「真正要访问的目标地址」。
 * 支持两种常见写法：
 *   /?url=https://...        —— 查询参数式
 *   /https://...             —— 前缀式（FlowForge 默认用这种）
 */
function extractTarget(incoming) {
  const byParam = incoming.searchParams.get('url');
  if (byParam) return byParam;

  // 去掉开头的斜杠，剩下的本身就是完整地址（含 https://）
  const rest = incoming.pathname.replace(/^\/+/, '');
  if (!rest) return '';

  return rest + incoming.search;
}
