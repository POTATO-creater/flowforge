import { describe, it, expect, vi, afterEach } from 'vitest';
import { callLLMStream, type LLMOptions } from './llm';
import type { ApiSettings } from '../types';

const settings: ApiSettings = {
  baseURL: 'https://ai.example.com/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  proxyURL: '',
};

const opts: LLMOptions = { model: 'test-model', prompt: '你好' };

/** 把若干段文本包成一条推流回复 */
function sseResponse(frames: string[], contentType = 'text/event-stream'): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const f of frames) c.enqueue(encoder.encode(f));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': contentType } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('callLLMStream', () => {
  it('正文增量逐段回调，最终结果与一次性版同形状', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'data: {"model":"m1","choices":[{"delta":{"content":"今天"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"天气"}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    );

    const deltas: string[] = [];
    const r = await callLLMStream(settings, opts, { onDelta: (t) => deltas.push(t) });

    expect(deltas).toEqual(['今天', '天气']);
    expect(r.content).toBe('今天天气');
    expect(r.model).toBe('m1');
    expect(r.finishReason).toBe('stop');
    expect(r.toolCalls).toBeUndefined();
  });

  it('请求里带 stream 开关，带 system 时的消息顺序正确', async () => {
    let captured: { url: string; body: string } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        captured = { url, body: init.body as string };
        return sseResponse(['data: [DONE]\n\n']);
      }),
    );

    await callLLMStream(
      settings,
      { model: 'm', system: '你是助手', prompt: 'hi' },
      { onDelta: () => {} },
    );

    const body = JSON.parse(captured!.body);
    expect(captured!.url).toBe('https://ai.example.com/v1/chat/completions');
    expect(body.stream).toBe(true);
    expect(body.messages[0]).toEqual({ role: 'system', content: '你是助手' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('工具调用分片按编号对齐拼接 arguments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          // 两个工具调用的碎片交错到达
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"get_weather","arguments":"{\\"city\\""}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_b","type":"function","function":{"name":"get_time","arguments":"{\\"tz\\""}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"北京\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":":\\"Asia/Shanghai\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    );

    const r = await callLLMStream(settings, opts, { onDelta: () => {} });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.toolCalls).toHaveLength(2);
    expect(r.toolCalls![0].function.name).toBe('get_weather');
    expect(JSON.parse(r.toolCalls![0].function.arguments)).toEqual({ city: '北京' });
    expect(r.toolCalls![1].id).toBe('call_b');
    expect(JSON.parse(r.toolCalls![1].function.arguments)).toEqual({ tz: 'Asia/Shanghai' });
  });

  it('思考流走 onReasoning，不混进正文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"reasoning_content":"先想想"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"答案"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    );

    const thinks: string[] = [];
    const outs: string[] = [];
    const r = await callLLMStream(settings, opts, {
      onDelta: (t) => outs.push(t),
      onReasoning: (t) => thinks.push(t),
    });

    expect(thinks).toEqual(['先想想']);
    expect(outs).toEqual(['答案']);
    expect(r.content).toBe('答案');
    expect(r.reasoning).toBe('先想想');
  });

  it('对方不支持流式（回的是普通JSON）时自动降级，一次性推出', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: 'm1',
              choices: [{ message: { content: '整块答案' }, finish_reason: 'stop' }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const deltas: string[] = [];
    const r = await callLLMStream(settings, opts, { onDelta: (t) => deltas.push(t) });
    expect(deltas).toEqual(['整块答案']);
    expect(r.content).toBe('整块答案');
    expect(r.finishReason).toBe('stop');
  });

  it('服务报错时翻成人话', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: '余额不足' } }), {
            status: 402,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    await expect(callLLMStream(settings, opts, { onDelta: () => {} })).rejects.toThrow(
      '问 AI 失败了：余额不足',
    );
  });

  it('最后一帧带 usage 时收下来', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
          'data: {"choices":[{"delta":{}}],"usage":{"total_tokens":10}}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    );

    const r = await callLLMStream(settings, opts, { onDelta: () => {} });
    expect(r.usage?.total_tokens).toBe(10);
  });
});
