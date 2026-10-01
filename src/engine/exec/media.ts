// ============================================================
// 出图执行器：画一张图 / 照着改图 / 多图合成
//
// 三个节点打到的是同一个服务，只是带的料不一样：
//   画一张图  → 只给描述
//   照着改图  → 描述 + 1 张原图
//   多图合成  → 描述 + 2~4 张原图
// 所以底层只留一个 createImage()，三个节点各自把料备好再交给它。
//
// 【为什么要把图存成一段文本（base64）而不是记个网址】
// 服务确实会返回一个图片网址，但那个网址所在的地方不让网页去读它
// （浏览器跨域限制）。后果是：画布上能看见图，可一旦「导出成图片」
// 或者拿去做别的处理，浏览器就会拦下来，导出的图里那个位置是空的。
// 把图直接存成一段文本，图就跟着流程走，全套操作都在本机完成，
// 不依赖那个网址能不能访问。
// ============================================================
import type { ApiSettings, ImageRatio, ImageSize } from '../../types';
import { isCorsLike } from '../../lib/net';
import type { NodeReporter } from './types';

/** 一次出图请求要带的东西 */
export interface ImageRequest {
  /** 想画成什么样 / 改成什么样 / 怎么合 */
  prompt: string;
  /** 参考图（画一张图时为空；改图 1 张；合成 2~4 张），每项都是可直接使用的图片数据 */
  inputs: string[];
  size: ImageSize;
  ratio: ImageRatio;
}

/** 出图结果 */
export interface ImageResult {
  /** 可直接塞进 <img> 的完整图片数据（data:image/png;base64,...） */
  image: string;
  /** 服务对描述的改写（有些服务会自动润色，返回为空表示没改） */
  revised: string;
}

/** 出错时抛出来的东西，带上「是不是等太久」这个信息，好让上层给不同的话术 */
type ImageError = Error & { stage?: 'submit' | 'poll' | 'download' | 'prepare' };

/**
 * 画图专用的模型。
 *
 * ⚠️ 这里【不能】借用聊天用的那个模型名 —— 两者是两码事：
 * 拿聊天的模型去画图，对方会直接拒绝，提示「这是聊天模型，请去用聊天接口」。
 * （曾经就因为把聊天模型名带了进来，三个画图节点全部跑不通。）
 */
const IMAGE_MODEL = 'agnes-image-2.5-flash';

function fail(msg: string, stage: ImageError['stage']): ImageError {
  const e = new Error(msg) as ImageError;
  e.stage = stage;
  return e;
}

/**
 * 出图本身很慢（实测标清约 9 秒、改图约 21 秒，档位越高越慢）。
 * 这里把「还没好」的情况都说清楚，别让人以为卡死了。
 */
const TIMEOUT_MS = 180_000;

/** 把各种形态的图片输入统一成 data: 开头、能直接喂给服务的一段文本 */
export function normalizeImageInput(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  // 已经是完整图片数据
  if (/^data:image\//i.test(s)) return s;
  // 裸的一段图片内容（上游存的时候可能已经剥掉了前缀）
  if (/^[A-Za-z0-9+/=\s]{200,}$/.test(s)) {
    return `data:image/png;base64,${s.replace(/\s+/g, '')}`;
  }
  // 是网址：原样交出去，由调用方决定能不能取
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

/**
 * 把网址形态的参考图变成图片数据。
 *
 * 为什么要多这一步：服务虽然能接受网址，但它自家产出的图所在的地方
 * 不许别的网页去读，所以拿它自己给的网址回去当参考图很可能失败。
 * 自己取回来转成数据更稳。
 */
async function urlToDataUrl(url: string, signal: AbortSignal): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch(url, { signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw fail(
      '这张参考图取不回来（存放图片的地方不让网页直接读）。\n换一张图试试，或者先用「画一张图」把它画出来再改。',
      'prepare',
    );
  }
  if (!resp.ok) {
    throw fail(`这张参考图取不回来（对方返回 ${resp.status}），换一张试试。`, 'prepare');
  }
  const blob = await resp.blob();
  return await blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ''));
    fr.onerror = () => reject(new Error('这张参考图读不出来，换一张试试。'));
    fr.readAsDataURL(blob);
  });
}

/** 一条参考图输入 → 可用的图片数据 */
async function prepareInput(raw: string, signal: AbortSignal): Promise<string> {
  const v = normalizeImageInput(raw);
  if (!v) {
    throw fail('要当参考的图没找到。检查一下是不是选错了节点，或者上游还没跑。', 'prepare');
  }
  if (/^https?:\/\//i.test(v)) return await urlToDataUrl(v, signal);
  return v;
}

/**
 * 动手出图。
 *
 * 有些服务是「先收活、再让客户端去问好了没」（异步任务制），
 * 这个端点实测是直接返回的，但为稳妥起见，拿到任务号也会去问一问。
 */
export async function createImage(
  settings: ApiSettings,
  req: ImageRequest,
  signal: AbortSignal,
  report?: NodeReporter,
): Promise<ImageResult> {
  if (!settings.apiKey) {
    throw fail('还没填 AI 的钥匙，去右上角设置里填一下（形如 sk- 开头那串）。', 'submit');
  }
  const prompt = (req.prompt ?? '').trim();
  if (!prompt) {
    throw fail('还没写要画什么。把想要的样子描述一句，再跑一次。', 'submit');
  }

  // —— 备料：参考图有网址形态的先取回来 ——
  const inputs: string[] = [];
  for (let i = 0; i < req.inputs.length; i++) {
    report?.note(`正在准备第 ${i + 1} 张参考图…`);
    inputs.push(await prepareInput(req.inputs[i], signal));
  }

  const base = settings.baseURL.replace(/\/+$/, '');
  const url = `${base}/images/generations`;

  /*
   * 带的料分两层：
   *   - 层级一（顶层）：服务直接认的参数，模型、描述、多大、什么形状、
   *     以及「把图当文本给我」这个开关。
   *   - 层级二（extra_body）：参考图这类扩展料，按服务约定塞在这个小盒子里。
   * 层级二里【不能】出现「要几张」这类顶层参数（同一个东西报两遍服务会拒），
   * 所以注意别把同一项写进两层。
   */
  const extra: Record<string, unknown> = {};
  if (inputs.length === 1) extra.image = [inputs[0]];
  else if (inputs.length > 1) extra.image = inputs;

  const payload: Record<string, unknown> = {
    // 画图必须用画图的模型（见 IMAGE_MODEL 的说明），聊天模型对方不收
    model: IMAGE_MODEL,
    prompt,
    size: req.size,
    ratio: req.ratio,
    n: 1,
    return_base64: true,
    ...(Object.keys(extra).length ? { extra_body: extra } : {}),
  };

  report?.note(inputs.length ? '正在照着参考图改，稍等…' : '正在画，稍等…');

  const resp = await postWithFallback(url, payload, settings, signal);

  if (!resp.ok) {
    throw fail(await explainImageHttpError(resp), 'submit');
  }

  const data = await resp.json();
  // 少数情况下服务会给一个任务号，让客户端自己去问进度
  const taskId = typeof data?.task_id === 'string' ? data.task_id : '';
  const item = data?.data?.[0] ?? {};
  const b64 = typeof item?.b64_json === 'string' ? item.b64_json : '';
  const remoteUrl = typeof item?.url === 'string' ? item.url : '';

  if (b64) {
    return {
      image: b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`,
      revised: typeof item?.revised_prompt === 'string' ? item.revised_prompt : '',
    };
  }

  // 没直接给图，但给了任务号 —— 去问
  if (taskId) {
    return await pollTask(base, taskId, settings, signal, report);
  }

  // 给了网址：取回来存成文本（这一步不做的话，导出的图会缺这块）
  if (remoteUrl) {
    report?.note('画好了，正在把图收下来…');
    return await withRetry(async () => ({
      image: await urlToDataUrl(remoteUrl, signal),
      revised: '',
    }), 'download', signal);
  }

  throw fail('这次没画出图来，换一句描述再试试。', 'submit');
}

/** 反复去问「图好了没」 */
async function pollTask(
  base: string,
  taskId: string,
  settings: ApiSettings,
  signal: AbortSignal,
  report?: NodeReporter,
): Promise<ImageResult> {
  const started = Date.now();
  const waitMs = [1500, 2000, 3000, 4000, 5000];
  let n = 0;
  const look = `${base}/images/tasks/${encodeURIComponent(taskId)}`;

  for (;;) {
    if (signal.aborted) throw fail('已经停下了。', 'poll');
    const waited = Math.round((Date.now() - started) / 1000);
    if (waited * 1000 > TIMEOUT_MS) {
      throw fail('等太久了，还没画完。把「画多清楚」调低一点再试试（越清楚越慢）。', 'poll');
    }
    report?.note(`还在画，已等 ${waited} 秒…`);

    const delay = waitMs[Math.min(n, waitMs.length - 1)];
    n++;
    await sleep(delay, signal);

    let resp: Response;
    try {
      resp = await fetch(look, {
        headers: { Authorization: `Bearer ${settings.apiKey}` },
        signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw fail('已经停下了。', 'poll');
      continue; // 问一次失败不算数，接着问
    }
    if (!resp.ok) continue;

    const j = await resp.json().catch(() => null);
    const it = j?.data?.[0] ?? j;
    const b = typeof it?.b64_json === 'string' ? it.b64_json : '';
    if (b) return { image: b.startsWith('data:') ? b : `data:image/png;base64,${b}`, revised: '' };
    const u = typeof it?.url === 'string' ? it.url : '';
    if (u) {
      report?.note('画好了，正在把图收下来…');
      return { image: await urlToDataUrl(u, signal), revised: '' };
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(fail('已经停下了。', 'poll'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** 下载类动作容易偶发失败，给它几次机会 */
async function withRetry<T>(fn: () => Promise<T>, stage: string, signal: AbortSignal): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      last = e;
      if (i < 2) await sleep(800 * (i + 1), signal);
    }
  }
  throw last instanceof Error ? last : fail(`${stage} 失败`, 'download');
}

/**
 * 发这次出图请求。直连被浏览器拦了就自动改走中转再试一次。
 *
 * 为什么不复用「读网页」那套网络层：那个走的是把网页转成文字的
 * 只读代理，会把这次要送出去的内容丢掉，出图请求靠它发不出去。
 */
async function postWithFallback(
  url: string,
  payload: Record<string, unknown>,
  settings: ApiSettings,
  signal: AbortSignal,
): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(payload),
  };

  try {
    return await fetch(url, init);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw fail('已经停下了。', 'submit');
    const proxy = (settings.proxyURL ?? '').trim();
    if (!isCorsLike(e) || !proxy) throw explainImageNetworkError(e, !!proxy);
    const pbase = proxy.endsWith('/') ? proxy : `${proxy}/`;
    try {
      return await fetch(pbase + url, init);
    } catch (e2) {
      throw explainImageNetworkError(e2, true);
    }
  }
}

/** 把出图请求的网络异常翻成人话 */
function explainImageNetworkError(e: unknown, hadProxy: boolean): Error {
  if (e instanceof Error && e.name === 'AbortError') return fail('已经停下了。', 'submit');
  if (isCorsLike(e)) {
    return fail(
      hadProxy
        ? '连中转也没能连上出图服务。检查一下设置里「网络中转」填得对不对。'
        : '出图服务不让网页直接访问（浏览器的安全规则）。\n去设置里的「网络中转」填一个中转地址再试。',
      'submit',
    );
  }
  if (e instanceof Error) return fail(e.message, 'submit');
  return fail(`连出图服务时出了点问题：${String(e)}`, 'submit');
}

/** 服务报错时，尽量把它的原话翻成能看懂的一句 */
async function explainImageHttpError(resp: Response): Promise<string> {
  let detail = '';
  try {
    const j = await resp.json();
    detail = String(j?.error?.message ?? j?.message ?? '');
  } catch {
    /* 对方没给可解析的内容，用状态码兜底 */
  }
  if (resp.status === 401 || resp.status === 403) {
    return '出图的钥匙不对或没权限。去右上角设置里检查一下钥匙填得对不对。';
  }
  if (resp.status === 429) {
    return '出图的人太多了，被暂时挡住了。等一分钟再试。';
  }
  if (resp.status === 400) {
    // 「拿聊天的模型来画图」这类用错模型的请求，对方也是回 400，单独翻成人话
    if (/chat model|chat\/completions/i.test(detail)) {
      return '画图得用画图的模型，刚才拿错了。这个错已经修好，直接再跑一次就行。';
    }
    // 请求编号是对方内部的记账信息，对外没意义，别吓唬人
    const brief = detail.replace(/\s*\(request id:[^)]*\)\s*/gi, '').trim();
    return `这次的要求对方不接受：${brief || '描述或尺寸可能不合规'}\n换个说法或换个尺寸再试试。`;
  }
  if (resp.status >= 500) {
    return '出图服务自己出了点状况，不是你的问题。等一会儿再试。';
  }
  return `出图没成功：${resp.status}${detail ? ` —— ${detail}` : ''}`;
}

// ============================================================
// 三个节点各自怎么备料
// ============================================================

/** 画一张图：只给描述 */
export async function runImageGen(
  settings: ApiSettings,
  prompt: string,
  size: ImageSize,
  ratio: ImageRatio,
  signal: AbortSignal,
  report?: NodeReporter,
): Promise<ImageResult> {
  return createImage(settings, { prompt, inputs: [], size, ratio }, signal, report);
}

/** 照着改图：一张原图 + 描述 */
export async function runImageEdit(
  settings: ApiSettings,
  image: string,
  prompt: string,
  size: ImageSize,
  ratio: ImageRatio,
  signal: AbortSignal,
  report?: NodeReporter,
): Promise<ImageResult> {
  return createImage(settings, { prompt, inputs: [image], size, ratio }, signal, report);
}

/** 多图合成：2~4 张图 + 描述 */
export async function runImageMix(
  settings: ApiSettings,
  images: string[],
  prompt: string,
  size: ImageSize,
  ratio: ImageRatio,
  signal: AbortSignal,
  report?: NodeReporter,
): Promise<ImageResult> {
  const list = images.map((s) => s.trim()).filter(Boolean);
  if (list.length < 2) {
    throw fail(
      '合成至少要两张图。每一行填一张的来源，比如 {{第一张图.图片}}。',
      'prepare',
    );
  }
  if (list.length > 4) {
    throw fail('一次最多合成 4 张图。去掉几张再试试。', 'prepare');
  }
  return createImage(settings, { prompt, inputs: list, size, ratio }, signal, report);
}

// ============================================================
// 生成视频
//
// 和出图是同一家人（同一个服务、同一把钥匙），但节奏完全不一样：
//   出图是「当场画好当场给」，视频是「先收单，做好了去问，好了去取」。
//   做一小段视频通常要一两分钟甚至更久，所以进度提示要跟得上。
//
// 【端点形状是怎么确认的】2026-10-01 用「404=没这条路 / 401=有这条路
// 但钥匙不被收」的区别探出来的（当时业务钥匙恰好被网关拒绝，反而方便
// 只看路径是否存在）：
//   POST /v1/videos              → 401（存在）收单
//   GET  /v1/videos/{id}         → 401（存在）问进度
//   GET  /v1/videos/{id}/content → 401（存在）取成片
//   其余 videos/generations、videos/tasks 之类全是 404（不存在）。
// 和业界通行的「视频任务」约定一致。请求体字段名（seconds 等）等
// 钥匙恢复后要实测校准，所以这里做了多重形态兼容。
// ============================================================

/**
 * 做视频专用的模型 —— 同样【不能】拿聊天模型来顶替：
 * 网关模型列表里确认存在 agnes-video-2.5 / agnes-video-2.5-flash /
 * agnes-video-v2.0 三档，选 flash 这一档（最快）。
 */
const VIDEO_MODEL = 'agnes-video-2.5-flash';

/** 形状 → 服务端认的像素写法 */
const VIDEO_SIZE: Record<string, string> = {
  '16:9': '1280x720',
  '9:16': '720x1280',
  '1:1': '960x960',
};

/** 视频结果：可直接塞进 <video> 的完整数据（data:video/mp4;base64,...） */
export interface VideoResult {
  video: string;
}

/** 一次做视频请求要带的东西 */
export interface VideoRequest {
  prompt: string;
  /** 多长（秒），形如 '5' */
  duration: string;
  /** 什么形状，'16:9' | '9:16' | '1:1' */
  ratio: string;
}

/** 做视频比画图慢得多，等的时间上限也放宽（10 分钟） */
const VIDEO_TIMEOUT_MS = 600_000;

/**
 * 大文件转数据一律走「字节 → 内容编码」，不用浏览器那个「文件读取器」：
 * 前者在浏览器和测试环境里都能跑，后者测试环境没有。
 */
function bytesToDataUrl(buf: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000; // 分块转，避免一次摊开几十万个字符
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  return `data:${mime || 'application/octet-stream'};base64,${b64}`;
}

/** 把进度翻成人话 */
function statusNote(status: string, waited: number): string {
  const s = (status || '').toLowerCase();
  if (/queu|pending|等待|排队/.test(s)) return `排上队了，还没开始做，已等 ${waited} 秒…`;
  if (/running|process|progress|生成中|制作|进行/.test(s)) return `正在做视频，已等 ${waited} 秒…（视频比图慢，别着急）`;
  if (/complet|succeed|success|完成|成功/.test(s)) return '做好了，正在把视频收下来…';
  return `还在做，已等 ${waited} 秒…`;
}

/** 判断一个进度值是不是「做好了」 */
function isDone(status: string): boolean {
  return /complet|succeed|success|完成|成功/i.test(status);
}

/** 判断一个进度值是不是「做砸了」 */
function isFailed(status: string): boolean {
  return /fail|error|cancel|失败|出错|取消/i.test(status);
}

/**
 * 动手做视频：收单 → 反复问进度 → 取成片。
 * 收单和问进度之间兼容各种响应形态（有的直接给结果，有的给任务号）。
 */
export async function createVideo(
  settings: ApiSettings,
  req: VideoRequest,
  signal: AbortSignal,
  report?: NodeReporter,
): Promise<VideoResult> {
  if (!settings.apiKey) {
    throw fail('还没填 AI 的钥匙，去右上角设置里填一下（形如 sk- 开头那串）。', 'submit');
  }
  const prompt = (req.prompt ?? '').trim();
  if (!prompt) {
    throw fail('还没写要拍什么。把想要的画面描述一句，再跑一次。', 'submit');
  }

  const base = settings.baseURL.replace(/\/+$/, '');
  const size = VIDEO_SIZE[req.ratio] ?? VIDEO_SIZE['16:9'];
  const seconds = /^\d+$/.test(req.duration) ? req.duration : '5';

  const payload: Record<string, unknown> = {
    model: VIDEO_MODEL, // 做视频必须用做视频的模型，聊天/画图的模型对方不收
    prompt,
    seconds,
    size,
  };

  report?.reset();
  report?.note('已经把单子递过去了，等它接…');

  let resp: Response;
  try {
    resp = await fetch(`${base}/videos`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw fail('已经停下了。', 'submit');
    throw fail('连做视频的服务都没连上。检查一下网络，或者稍后再试。', 'submit');
  }

  if (!resp.ok) {
    throw fail(await explainVideoHttpError(resp), 'submit');
  }

  const first = (await resp.json().catch(() => null)) as Record<string, unknown> | null;

  // —— 形态一：当场就把成片给了（少见，但顺手接住）——
  const direct = await pickVideoFromPayload(first, signal, report);
  if (direct) return { video: direct };

  // —— 形态二：给了任务号，去问进度 ——
  const taskId =
    typeof first?.id === 'string'
      ? first.id
      : typeof first?.task_id === 'string'
        ? first.task_id
        : '';
  if (!taskId) {
    throw fail('这次没做出视频来（对方没给单号也没给成片），换个说法再试试。', 'submit');
  }

  return await pollVideo(base, taskId, settings, signal, report);
}

/** 反复去问「视频好了没」，好了就取回来 */
async function pollVideo(
  base: string,
  taskId: string,
  settings: ApiSettings,
  signal: AbortSignal,
  report?: NodeReporter,
): Promise<VideoResult> {
  const started = Date.now();
  const waitMs = [2000, 3000, 5000, 5000, 8000];
  let n = 0;
  const look = `${base}/videos/${encodeURIComponent(taskId)}`;

  for (;;) {
    if (signal.aborted) throw fail('已经停下了。', 'poll');
    const waited = Math.round((Date.now() - started) / 1000);
    if (waited * 1000 > VIDEO_TIMEOUT_MS) {
      throw fail(
        '等了快 10 分钟还没做好。视频本来就慢，可以等会儿直接再跑一次；或者把时长调短一点。',
        'poll',
      );
    }

    const delay = waitMs[Math.min(n, waitMs.length - 1)];
    n++;
    await sleep(delay, signal);
    if (signal.aborted) throw fail('已经停下了。', 'poll');

    let resp: Response;
    try {
      resp = await fetch(look, {
        headers: { Authorization: `Bearer ${settings.apiKey}` },
        signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw fail('已经停下了。', 'poll');
      continue; // 问一次失败不算数，接着问
    }
    if (!resp.ok) continue;

    const j = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
    const status = String(j?.status ?? '');
    report?.note(statusNote(status, waited));

    if (isFailed(status)) {
      const why =
        typeof (j?.error as Record<string, unknown>)?.message === 'string'
          ? String((j?.error as Record<string, unknown>).message)
          : '';
      throw fail(why ? `这次没做出来：${why}\n换个说法或换个时长再试试。` : '这次没做出来，换个说法再试试。', 'poll');
    }

    // 好了：先看回复里有没有直接给视频，没有就去取成片
    if (isDone(status) || !status) {
      const got = await pickVideoFromPayload(j, signal, report);
      if (got) return { video: got };
      report?.note('做好了，正在把视频收下来…');
      const raw = await downloadVideoContent(base, taskId, settings, signal);
      return { video: raw };
    }
  }
}

/**
 * 各种回复形态里把视频找出来：
 *   b64_json / video / url（data: 或 http）/ data[0].xxx 同样一套。
 */
async function pickVideoFromPayload(
  payload: Record<string, unknown> | null,
  signal: AbortSignal,
  report?: NodeReporter,
): Promise<string> {
  if (!payload) return '';
  const items: Record<string, unknown>[] = Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>[])
    : [payload];

  for (const it of items) {
    const b64 = it?.b64_json;
    if (typeof b64 === 'string' && b64.length > 100) {
      return b64.startsWith('data:') ? b64 : `data:video/mp4;base64,${b64}`;
    }
    for (const key of ['video', 'video_url', 'url', 'content_url']) {
      const v = it?.[key];
      if (typeof v !== 'string' || !v) continue;
      if (/^data:video\//i.test(v)) return v;
      if (/^https?:\/\//i.test(v)) {
        report?.note('做好了，正在把视频收下来…');
        return await fetchVideoToDataUrl(v, signal);
      }
    }
  }
  return '';
}

/** 把一个视频网址收成数据（跟图不一样：视频网址不收成数据，后面谁也用不了） */
async function fetchVideoToDataUrl(url: string, signal: AbortSignal): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch(url, { signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw fail('已经停下了。', 'download');
    throw fail('视频存放的地方不让网页直接读，收不回来。再跑一次试试。', 'download');
  }
  if (!resp.ok) {
    throw fail(`视频收不回来（对方返回 ${resp.status}），再跑一次试试。`, 'download');
  }
  const blob = await resp.blob();
  return bytesToDataUrl(await blob.arrayBuffer(), blob.type || 'video/mp4');
}

/** 从「取成片」的路子拿视频（回复里不带网址时的标准做法） */
async function downloadVideoContent(
  base: string,
  taskId: string,
  settings: ApiSettings,
  signal: AbortSignal,
): Promise<string> {
  return withRetry(async () => {
    const resp = await fetch(`${base}/videos/${encodeURIComponent(taskId)}/content`, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      signal,
    });
    if (!resp.ok) throw fail(`成片取不回来（对方返回 ${resp.status}）。`, 'download');
    const blob = await resp.blob();
    return bytesToDataUrl(await blob.arrayBuffer(), blob.type || 'video/mp4');
  }, 'download', signal);
}

/** 生成视频：描述 + 时长 + 形状 */
export async function runVideoGen(
  settings: ApiSettings,
  prompt: string,
  duration: string,
  ratio: string,
  signal: AbortSignal,
  report?: NodeReporter,
): Promise<VideoResult> {
  return createVideo(settings, { prompt, duration, ratio }, signal, report);
}

/** 做视频这边的报错翻话术（跟出图一套风格，但说法是视频的） */
async function explainVideoHttpError(resp: Response): Promise<string> {
  let detail = '';
  try {
    const j = await resp.json();
    detail = String(j?.error?.message ?? j?.message ?? '');
  } catch {
    /* 对方没给可解析的内容，用状态码兜底 */
  }
  if (resp.status === 401 || resp.status === 403) {
    return '做视频的钥匙现在不被收（可能是免费额度用完了）。如果聊天和画图也不行了，就是同一件事——等额度恢复，或者换一把钥匙。';
  }
  if (resp.status === 429) {
    return '现在做视频的人太多，被暂时挡住了。等几分钟再试。';
  }
  if (resp.status === 400) {
    const brief = detail.replace(/\s*\(request id:[^)]*\)\s*/gi, '').trim();
    return `这次的要求对方不接受：${brief || '描述、时长或形状可能不合规'}\n换个说法或换个时长再试试。`;
  }
  if (resp.status === 404) {
    return '做视频的入口暂时不在了（服务可能在调整）。过段时间再试。';
  }
  if (resp.status >= 500) {
    return '做视频的服务自己出了点状况，不是你的问题。等一会儿再试。';
  }
  return `视频没做成：${resp.status}${detail ? ` —— ${detail}` : ''}`;
}
