// ============================================================
// 已验证可用的公开数据源
//
// 【重要】这里只收录【实测确认支持跨域】且【不需要密钥】的接口。
// 实测方法（可复现）：对接口发一次请求，检查响应头里是否有
//   access-control-allow-origin: *
// 没有这个头的接口，浏览器一律读不到内容，放进来就是「能配但跑不通」。
//
// 实测记录（2026-09）：
//   ✅ hn.algolia.com              → *（HN 榜单走这个，一次拿全）
//   ✅ catfact.ninja               → *
//   ✅ uselessfacts.jsph.pl        → *
//   ✅ quickchart.io               → *
//   ⚠️ hacker-news.firebaseio.com  → 有跨域头，但实测会间歇性连不上，故不用
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
    desc: '当前挂在首页的帖子',
  },
  {
    id: 'hn-new',
    name: '最新榜',
    desc: '刚刚发出来的帖子',
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
 *
 * 这里用 Algolia 的搜索接口，而不是官方 Firebase 接口，原因是它更可靠：
 *   1. 一次请求就拿到全部内容（Firebase 要先拿编号、再逐个取详情，10 条就是 11 次请求）；
 *   2. 实测响应头带 access-control-allow-origin: *，浏览器能直接读；
 *   3. Firebase 那个域名在实测中会间歇性连不上。
 *
 * Algolia 接口用 tags 区分榜单：
 *   front_page = 首页热门，story = 全部帖子（按时间倒序即为「最新」）
 */
export function hnListUrl(source: string): string {
  const tag = source === 'hn-new' ? 'story' : 'front_page';
  const sort = source === 'hn-new' ? 'search_by_date' : 'search';
  return `https://hn.algolia.com/api/v1/${sort}?tags=${tag}&hitsPerPage=50`;
}

/** 从 Algolia 的返回里取出帖子列表 */
export function pickHnList(json: unknown): { title: string; url: string; score: number }[] {
  if (!json || typeof json !== 'object') return [];
  const hits = (json as Record<string, unknown>).hits;
  if (!Array.isArray(hits)) return [];
  return hits.map((h) => {
    const r = (h ?? {}) as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title : '';
    const url =
      typeof r.url === 'string' && r.url
        ? r.url
        : `https://news.ycombinator.com/item?id=${r.objectID ?? ''}`;
    const score = typeof r.points === 'number' ? r.points : 0;
    return { title, url, score };
  });
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
