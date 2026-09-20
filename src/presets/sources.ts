// ============================================================
// 已验证可用的公开数据源
//
// 【重要】这里只收录【实测确认支持跨域】且【不需要密钥】的接口。
// 实测方法（可复现）：对接口发一次请求，检查响应头里是否有
//   access-control-allow-origin: *
// 没有这个头的接口，浏览器一律读不到内容，放进来就是「能配但跑不通」。
//
// 实测记录（2026-09）：
//   ✅ hacker-news.firebaseio.com  → access-control-allow-origin: *
//   ✅ hn.algolia.com              → *
//   ✅ catfact.ninja               → *
//   ✅ uselessfacts.jsph.pl        → *
//   ✅ quickchart.io               → *
//   ❌ api.open-meteo.com（天气）   → 无该响应头
//   ❌ date.nager.at（节假日）      → 无
//   ❌ api.nhtsa.gov               → 无
// ============================================================

export interface OpenSource {
  id: string;
  name: string;
  /** 给用户看的一句话说明 */
  desc: string;
}

/** 「看技术热榜」可选的数据源 */
export const HN_SOURCES: OpenSource[] = [
  {
    id: 'hn-top',
    name: '热门榜',
    desc: '当前最热门的帖子',
  },
  {
    id: 'hn-new',
    name: '最新榜',
    desc: '刚刚发出来的帖子',
  },
  {
    id: 'hn-best',
    name: '精选榜',
    desc: '编辑挑选的优质帖子',
  },
];

/** 「查事实」可选的数据源（都是免密钥、支持跨域的） */
export const FACT_SOURCES: OpenSource[] = [
  {
    id: 'catfact',
    name: '聊聊猫',
    desc: '关于猫的小知识，英文',
  },
  {
    id: 'uselessfacts',
    name: '冷知识',
    desc: '没什么用但挺有意思的冷知识',
  },
];

/**
 * Hacker News 的接口地址。
 * 它是 Firebase 风格的接口：先拿一串编号，再逐个取详情。
 */
export function hnListUrl(source: string): string {
  const key =
    source === 'hn-new' ? 'newstories' : source === 'hn-best' ? 'beststories' : 'topstories';
  return `https://hacker-news.firebaseio.com/v0/${key}.json`;
}

export function hnItemUrl(id: number): string {
  return `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
}

export function factUrl(source: string): string {
  return source === 'uselessfacts'
    ? 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en'
    : 'https://catfact.ninja/fact';
}

/** 从「查事实」接口的返回里取出那句话（两个源字段名不同） */
export function pickFactText(json: unknown): string {
  if (json && typeof json === 'object') {
    const r = json as Record<string, unknown>;
    const v = r.fact ?? r.text;
    if (typeof v === 'string') return v;
  }
  return '';
}

/** 从 Hacker News 的条目里取出标题和链接 */
export function pickHnItem(json: unknown): { title: string; url: string; score: number } {
  if (json && typeof json === 'object') {
    const r = json as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title : '';
    const url = typeof r.url === 'string' ? r.url : `https://news.ycombinator.com/item?id=${r.id}`;
    const score = typeof r.score === 'number' ? r.score : 0;
    return { title, url, score };
  }
  return { title: '', url: '', score: 0 };
}
