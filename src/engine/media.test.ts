// ============================================================
// 「生成视频」执行器测试
//
// 服务端是「收单 → 问进度 → 取成片」三步走，这里把每一步的
// 网络回复都仿出来，验证：
//   - 请求带对了模型（绝不能拿聊天模型去做视频）
//   - 各种回复形态都能把视频接住
//   - 出错时给人能看懂的话
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createVideo, runVideoGen } from './exec/media';
import type { ApiSettings } from '../types';
import type { NodeReporter } from './exec/types';

const settings: ApiSettings = {
  baseURL: 'https://ai.example.com/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  proxyURL: '',
};

const BASE = 'https://ai.example.com/v1';

/** 记中间态话术用的假进度员 */
function spyReporter() {
  const notes: string[] = [];
  const r: NodeReporter = {
    note: (m) => notes.push(m),
    delta: () => {},
    reset: () => notes.length = 0,
  };
  return { r, notes };
}

/** 一小段假视频字节，包成 mp4 回复 */
function videoResponse(): Response {
  const raw = new Uint8Array([0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]); // "ftypmp42"
  return new Response(raw, { status: 200, headers: { 'content-type': 'video/mp4' } });
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createVideo', () => {
  it('还没写要拍什么时，用人话说清楚，不发出请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(createVideo(settings, { prompt: '  ', duration: '5', ratio: '16:9' }, new AbortController().signal)).rejects.toThrow(
      /还没写要拍什么/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('收单请求：走 /videos、带做视频的模型、时长与形状都按约定给', async () => {
    let captured: { url: string; method: string; body: string } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (String(url) === `${BASE}/videos` && init.method === 'POST') {
          captured = { url: String(url), method: init.method, body: init.body as string };
          return jsonResponse({ id: 'vid_1', status: 'completed', video_url: 'https://cdn.example.com/a.mp4' });
        }
        if (String(url) === 'https://cdn.example.com/a.mp4') return videoResponse();
        return jsonResponse({}, 404);
      }),
    );

    await createVideo(settings, { prompt: '一只猫', duration: '10', ratio: '9:16' }, new AbortController().signal);

    expect(captured).not.toBeNull();
    const body = JSON.parse(captured!.body);
    expect(captured!.url).toBe(`${BASE}/videos`);
    expect(body.model).toBe('agnes-video-2.5-flash'); // 绝不能是聊天模型
    expect(body.prompt).toBe('一只猫');
    expect(body.seconds).toBe('10');
    expect(body.size).toBe('720x1280'); // 9:16 对应的像素写法
  });

  it('收单当场给了视频内容：直接接住，不再去问进度', async () => {
    const b64 = 'A'.repeat(200); // 长度要过「像不像真内容」这一关
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [{ b64_json: b64 }] })),
    );

    const r = await createVideo(settings, { prompt: '一只猫', duration: '5', ratio: '16:9' }, new AbortController().signal);
    expect(r.video).toBe(`data:video/mp4;base64,${b64}`);
  });

  it('给了单号：问一次进度就完成，从网址把视频收成数据', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u === `${BASE}/videos`) return jsonResponse({ id: 'vid_1', status: 'queued' });
        if (u === `${BASE}/videos/vid_1`) return jsonResponse({ status: 'completed', url: 'https://cdn.example.com/a.mp4' });
        if (u === 'https://cdn.example.com/a.mp4') return videoResponse();
        return jsonResponse({}, 404);
      }),
    );

    const { r, notes } = spyReporter();
    const p = createVideo(settings, { prompt: '一只猫', duration: '5', ratio: '16:9' }, new AbortController().signal, r);
    await vi.runAllTimersAsync();
    const out = await p;

    expect(out.video).toMatch(/^data:video\/mp4;base64,/);
    expect(notes.length).toBeGreaterThan(0); // 中间态话术有在报
  });

  it('问了几次才好、回复里没网址：从取成片的路子拿回视频', async () => {
    vi.useFakeTimers();
    let pollCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u === `${BASE}/videos`) return jsonResponse({ id: 'vid_1', status: 'queued' });
        if (u === `${BASE}/videos/vid_1`) {
          pollCount++;
          if (pollCount < 3) return jsonResponse({ status: 'in_progress' });
          return jsonResponse({ status: 'completed' }); // 没带网址 → 走 /content
        }
        if (u === `${BASE}/videos/vid_1/content`) return videoResponse();
        return jsonResponse({}, 404);
      }),
    );

    const p = createVideo(settings, { prompt: '一只猫', duration: '5', ratio: '1:1' }, new AbortController().signal);
    await vi.runAllTimersAsync();
    const out = await p;

    expect(out.video).toMatch(/^data:video\/mp4;base64,/);
    expect(pollCount).toBe(3);
  });

  it('进度显示失败时，把失败原因翻成人话', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u === `${BASE}/videos`) return jsonResponse({ id: 'vid_2', status: 'queued' });
        if (u === `${BASE}/videos/vid_2`) {
          return jsonResponse({ status: 'failed', error: { message: '内容不合规' } });
        }
        return jsonResponse({}, 404);
      }),
    );

    // 先接住错误再推进时间：fake timers 下 promise 会在推进期间就拒绝，
    // 断言挂晚了会变成「未处理的拒绝」而不是测试失败
    const caught = createVideo(
      settings,
      { prompt: '测试', duration: '5', ratio: '16:9' },
      new AbortController().signal,
    ).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = (await caught) as Error;

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/没做出来.*内容不合规/s);
  });

  it('收单被拒（401）：说的是额度/钥匙的事，不带吓人的原文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'Invalid token (request id: xxx)' } }, 401)),
    );

    await expect(
      createVideo(settings, { prompt: '一只猫', duration: '5', ratio: '16:9' }, new AbortController().signal),
    ).rejects.toThrow(/钥匙.*额度|额度.*钥匙/s);
  });

  it('收单 429：提示人多，稍后再来', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 429)));

    await expect(
      createVideo(settings, { prompt: '一只猫', duration: '5', ratio: '16:9' }, new AbortController().signal),
    ).rejects.toThrow(/太多/);
  });

  it('runVideoGen：透传时长与形状，最终返回视频', async () => {
    vi.useFakeTimers();
    let body: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const u = String(url);
        if (u === `${BASE}/videos`) {
          body = JSON.parse(init.body as string);
          return jsonResponse({ id: 'vid_3', status: 'completed', video_url: 'https://cdn.example.com/b.mp4' });
        }
        if (u === 'https://cdn.example.com/b.mp4') return videoResponse();
        return jsonResponse({}, 404);
      }),
    );

    const p = runVideoGen(settings, '熊猫吃竹子', '5', '16:9', new AbortController().signal);
    await vi.runAllTimersAsync();
    const out = await p;

    expect(out.video).toMatch(/^data:video\//);
    expect(body!.seconds).toBe('5');
    expect(body!.size).toBe('1280x720');
  });
});
