/**
 * 把节点跑出来的结果，变成一段人能直接读的话。
 *
 * 引擎里每个节点产出的结构不一样（AI 是 content、抓网页是 body、
 * 判断是 branch……），这里统一按「最像正文的那个」取出来。
 * 节点卡片上的结果预览、右侧面板的结果区，都用这一份逻辑，
 * 避免两处各写一套、改一处漏一处。
 */
export function readableOutput(out: Record<string, unknown> | undefined): string {
  if (out == null) return '';

  // 判断节点比较特殊：它没有正文，只有一个「是 / 否」的分岔结果
  const branch = out.branch ?? out.condition;
  if (typeof branch === 'boolean') return branch ? '成立' : '不成立';
  if (typeof branch === 'string' && (branch === 'true' || branch === 'false')) {
    return branch === 'true' ? '成立' : '不成立';
  }

  // 图表节点产出的是很长一串图片网址，直接铺在卡片上没法看。
  // 卡片上已经把图贴出来了（见 outputImage），这里只报个数。
  if (typeof out.image === 'string' && typeof out.count === 'number') {
    return `画好了 ${out.count} 组数据的图，图就在卡片上`;
  }

  const v = out.content ?? out.text ?? out.result ?? out.body ?? out.answer;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);

  // 汇总 / 程序加工这类，结果可能是个数组或对象
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
  if (v && typeof v === 'object') {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }

  // 兜底：整个 output 里找第一个字符串值（跳过图片网址，它太长且要单独贴图）
  for (const val of Object.values(out)) {
    if (typeof val === 'string' && val.trim() && !/^https?:\/\//i.test(val)) return val;
  }
  return '';
}

/**
 * 结果里如果是一张图，把图片地址拿出来，好让界面直接把图画出来。
 * 「出图表」节点会产出 image 字段；「显示面板」看到一张图时，
 * 会把地址原样放在 shown 上，这里一并认。
 */
export function outputImage(out: Record<string, unknown> | undefined): string {
  if (out == null) return '';
  const img = out.image ?? out.imageUrl ?? out.chart ?? out.shown;
  if (typeof img === 'string' && /^(https?:|data:image\/)/i.test(img)) return img;
  return '';
}

/** 结果太长时截一下，卡片上放不下那么多字 */
export function clip(text: string, max = 160): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };
  return { text: text.slice(0, max), clipped: true };
}
