// ============================================================
// 服务器推流（SSE）解析：AI 逐字回答、读网页长连接共用的一层
//
// 说人话：服务器不肯一次性把答案给全，而是一个字一个字往外蹦。
// 这份代码负责把「蹦过来的碎片」按规范切成一帧一帧，交给上层。
//
// 两种用法：
//   - readSSE：读完为止（AI 回答说完就断开，用这个）；
//   - 长连接不断开的（读网页那种），engine/mcp.ts 里有自己的循环，
//     但切帧规则同样用这里的 parseSseFrame。
// ============================================================

/** 推流里的一帧：只有数据和事件名两种信息 */
export interface SseFrame {
  event: string;
  data: string;
}

/**
 * 把一帧原始文本解析成 { event, data }。
 * 规则：以 `:` 开头的是注释/心跳（忽略）；`event:` 标事件名；
 * `data:` 是一行数据，多行 data 用换行拼起来。
 * 解析不出数据就返回 null。
 */
export function parseSseFrame(frame: string): SseFrame | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      // 规范规定：冒号后若有一个空格要去掉
      dataLines.push(line.slice(5).replace(/^\s/, ''));
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/**
 * 从一条「会结束的」推流里持续读帧，读到流结束为止。
 * 每切出一帧就回调 onFrame；流读完了这个 Promise 才结束。
 */
export async function readSSE(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
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

  // 收尾：解码器里可能还压着半个字；缓冲里可能还有一帧没以空行结尾
  buffer += decoder.decode();
  const tail = parseSseFrame(buffer);
  if (tail) onFrame(tail);
}
