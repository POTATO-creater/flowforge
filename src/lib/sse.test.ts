import { describe, it, expect } from 'vitest';
import { parseSseFrame, readSSE } from './sse';

// —— parseSseFrame：一帧原始文本 -> { event, data } ——

describe('parseSseFrame', () => {
  it('普通一帧：只有数据', () => {
    expect(parseSseFrame('data: hello')).toEqual({ event: 'message', data: 'hello' });
  });

  it('带事件名的一帧', () => {
    expect(parseSseFrame('event: endpoint\ndata: /abc')).toEqual({
      event: 'endpoint',
      data: '/abc',
    });
  });

  it('冒号后带一个空格要去掉，但只去一个', () => {
    expect(parseSseFrame('data:  两个空格')).toEqual({ event: 'message', data: ' 两个空格' });
  });

  it('多行 data 用换行拼起来', () => {
    expect(parseSseFrame('data: a\ndata: b')).toEqual({ event: 'message', data: 'a\nb' });
  });

  it('注释行（:开头）忽略；没有数据返回 null', () => {
    expect(parseSseFrame(': heartbeat')).toBeNull();
    expect(parseSseFrame('')).toBeNull();
    expect(parseSseFrame('event: ping')).toBeNull();
  });

  it('[DONE] 原样交出，由上层决定怎么处理', () => {
    expect(parseSseFrame('data: [DONE]')).toEqual({ event: 'message', data: '[DONE]' });
  });
});

// —— readSSE：字节流 -> 一帧一帧回调 ——

/** 造一条会结束的字节流 */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const s of chunks) c.enqueue(encoder.encode(s));
      c.close();
    },
  });
}

async function collect(chunks: string[]): Promise<string[]> {
  const got: string[] = [];
  await readSSE(streamOf(chunks), (f) => got.push(`${f.event}|${f.data}`));
  return got;
}

describe('readSSE', () => {
  it('标准推流：按空行切帧', async () => {
    const got = await collect(['data: 1\n\n', 'data: 2\n\n']);
    expect(got).toEqual(['message|1', 'message|2']);
  });

  it('一帧被拆在两个网络包里也能拼回来', async () => {
    const got = await collect(['data: he', 'llo\n\ndata: w', 'orld\n\n']);
    expect(got).toEqual(['message|hello', 'message|world']);
  });

  it('CRLF 换行也认', async () => {
    const got = await collect(['data: a\r\n\r\ndata: b\r\n\r\n']);
    expect(got).toEqual(['message|a', 'message|b']);
  });

  it('事件名跨包、心跳注释、结束时不丢最后一帧', async () => {
    const got = await collect([
      'event: en', 'dpoint\ndata: /x\n\n',
      ': ping\n\n',
      'data: last', // 故意不给结尾空行
    ]);
    expect(got).toEqual(['endpoint|/x', 'message|last']);
  });

  it('AI 那种一串 JSON 一帧的长流', async () => {
    const frames = [
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const got = await collect(frames);
    expect(got).toHaveLength(3);
    expect(JSON.parse(got[0].split('|')[1]).choices[0].delta.content).toBe('你');
    expect(got[2]).toBe('message|[DONE]');
  });
});
