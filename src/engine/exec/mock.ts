// ============================================================
// 假数据：让「不调真实接口也能把流程跑通」成为现实
//
// 只覆盖需要联网 / 调 AI 的节点；数据整理、文字、编码这类纯本地节点
// 直接走真实逻辑，不做伪造 —— 它们本来就不花钱、不依赖网络。
// ============================================================
import type {
  NodeKind,
  NodeConfig,
  LLMConfig,
  ChainConfig,
  AgentConfig,
} from '../../types';


/** 返回构造好的结果；纯本地节点不伪造，返回 null 交给真实逻辑 */
export function mockOutput(
  kind: NodeKind,
  config: NodeConfig,
): Record<string, unknown> | null {
  switch (kind) {
    case 'llm':
    case 'chain':
    case 'agent': {
      const c = config as LLMConfig & ChainConfig & AgentConfig;
      return {
        content: '（假数据）这是 AI 的模拟回复，用来先把流程跑通。填好密钥后这里会变成真实内容。',
        reasoning: '步骤1：理解问题。\n步骤2：给出结论。',
        steps: ['步骤1：理解问题', '步骤2：给出结论'],
        model: (c.model as string) || 'mock-model',
        usage: { total_tokens: 128 },
        toolCalls: [],
        rounds: 1,
      };
    }
    case 'loop': {
      return {
        results: ['（假数据）第 1 段的处理结果', '（假数据）第 2 段的处理结果'],
        text: '（假数据）第 1 段的处理结果\n（假数据）第 2 段的处理结果',
        count: 2,
        truncated: false,
      };
    }
    case 'fetch':
      return {
        content: '（假数据）这是抓回来的网页文字示例，足够用来验证后续节点。',
        title: '示例页面',
        url: 'https://example.com',
        status: 200,
      };
    case 'tool':
      return { status: 200, body: '（假数据）接口返回的示例内容。', json: null };
    case 'hn':
      return {
        list: '1. 示例话题（99 分）\nhttps://example.com/a\n\n2. 另一个示例（88 分）\nhttps://example.com/b',
        items: [
          { title: '示例话题', score: 99, url: 'https://example.com/a' },
          { title: '另一个示例', score: 88, url: 'https://example.com/b' },
        ],
        count: 2,
      };
    case 'rss':
      return {
        list: '示例文章标题\nhttps://example.com/post',
        items: [{ title: '示例文章标题', link: 'https://example.com/post' }],
        count: 1,
      };
    case 'fact':
      return { text: '（假数据）猫的呼噜声频率大约在 25–150 Hz。', content: '（假数据）猫的呼噜声频率大约在 25–150 Hz。' };
    case 'chart':
      return { url: 'mock-chart://bar', image: 'mock-chart://bar', count: 3 };
    case 'imageGen':
    case 'imageEdit':
    case 'imageMix':
      /*
       * 出图很慢（十几秒到一分钟），假数据模式的意义就是「先不花钱把流程串通」，
       * 所以这里给一张本机现画的占位图（一段灰色底带文字的图），
       * 形状按用户选的档位来，这样下游「照着改图」也能真的接到东西。
       * 不写死成外部网址：那样导出时会因为跨域而缺图，假数据反而添乱。
       */
      return {
        image: placeholderImage(config),
        prompt: '（假数据）这是占位图，用来先把流程串通。',
        revised: '',
      };
    case 'mcpFetch':
      return {
        content: '（假数据）这是从网页上读回来的正文示例，足够用来验证后面的节点。',
        title: '示例页面',
        url: 'https://example.com/article',
        status: 200,
      };
    default:
      // 其它节点（数据整理 / 文字 / 编码 / 流程控制）走真实逻辑，不在此伪造
      return null;
  }
}

/**
 * 现画一张占位图，返回可直接用的图片数据。
 *
 * 为什么不用外部占位图服务：一是断网就没图，二是那种网址多半不允许
 * 网页去读，导出画布时会缺一块。这里用 canvas 画一张本地图，
 * 尺寸取用户选的那档（认不出就让它是方的），一眼能看出是假数据。
 */
function placeholderImage(config: NodeConfig): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#cfd3da"/><stop offset="1" stop-color="#a8b0bd"/>` +
    `</linearGradient></defs>` +
    `<rect width="512" height="512" fill="url(#g)"/>` +
    `<text x="256" y="240" text-anchor="middle" font-family="sans-serif" ` +
    `font-size="34" fill="#4a5260">假数据占位图</text>` +
    `<text x="256" y="286" text-anchor="middle" font-family="sans-serif" ` +
    `font-size="20" fill="#667080">填好钥匙后会变成真图</text>` +
    `</svg>`;
  const ratio = (config as { ratio?: string }).ratio ?? '1:1';
  void ratio; // 形状暂不体现，保持占位图简单
  // 用 encodeURIComponent 而不是 btoa：中文在 btoa 下会直接抛错
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
