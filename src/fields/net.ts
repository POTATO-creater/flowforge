// ============================================================
// 各节点的字段描述：驱动 Inspector 通用渲染 + 简单点/全都要模式分级
//
// 【写作规范】所有 label / hint / placeholder 必须是大白话。
// 禁止出现：token、JSON、System Prompt、API、表达式、插值、
//          HTML、Markdown、布尔、变量名等技术词。
// 变量一律使用中文：{{节点名.结果名}}
// ============================================================

import type { NodeKind, NodeFieldSpec } from '../types';

// ============================================================
// 网络类（走跨域治理层；只收录实测支持跨域、免密钥的源）
// ============================================================
/** ============================================================
 *  网络类（走跨域治理层；只收录实测支持跨域、免密钥的源）
 *  ============================================================ */
export const NET_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  hn: {
    plain: '把技术圈正在热议的话题榜单拿下来，可以接着让 AI 帮你总结。',
    resultName: '榜单',
    fields: [
      {
        key: 'source',
        label: '看哪个榜',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'hn-top', label: '热门榜' },
          { value: 'hn-new', label: '最新榜' },
        ],
        vars: false,
      },
      {
        key: 'count',
        label: '拿几条',
        type: 'number',
        level: 'basic',
        min: 1,
        max: 50,
        hint: '建议 5~15 条，太多会慢',
        vars: false,
      },
    ],
  },

  rss: {
    plain: '把一个订阅地址（那种给阅读器用的）里的最新文章标题和链接拿下来。',
    resultName: '文章',
    fields: [
      {
        key: 'url',
        label: '订阅地址',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '以 .xml 或 /feed 结尾的那种地址',
        hint: '很多网站的页脚会写「RSS」或「订阅」，点进去就是它',
      },
      {
        key: 'count',
        label: '拿几篇',
        type: 'number',
        level: 'advanced',
        min: 1,
        max: 50,
        vars: false,
      },
    ],
  },

  chart: {
    plain: '把一串数字画成柱状图、折线图或饼图，生成一张图片地址，可以直接展示。',
    resultName: '图片',
    fields: [
      {
        key: 'chartType',
        label: '画成什么图',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'bar', label: '柱状图' },
          { value: 'line', label: '折线图' },
          { value: 'pie', label: '饼图' },
          { value: 'doughnut', label: '圆环图' },
        ],
        vars: false,
      },
      {
        key: 'labels',
        label: '每根柱子叫什么',
        type: 'text',
        level: 'basic',
        placeholder: '用逗号隔开，例如：一月, 二月, 三月',
        hint: '有几项就和下面的数字一样多',
      },
      {
        key: 'values',
        label: '每根柱子多高',
        type: 'text',
        level: 'basic',
        placeholder: '用逗号隔开，例如：10, 20, 15',
        hint: '可以点上面的按钮把前面算出来的数字放进来',
      },
      {
        key: 'title',
        label: '图表的标题',
        type: 'text',
        level: 'advanced',
        placeholder: '可以不填',
        vars: false,
      },
    ],
  },

  fact: {
    plain: '随机拿一条冷知识或猫的小知识，用来测试流程、或者当内容素材。',
    resultName: '内容',
    fields: [
      {
        key: 'source',
        label: '从哪儿拿',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'uselessfacts', label: '冷知识' },
          { value: 'catfact', label: '聊聊猫' },
        ],
        vars: false,
      },
    ],
  },

  mcpFetch: {
    plain: '把一个网页的正文读出来。用的是一台专门的阅读器，读出来就是干净的文字，后面的节点能直接拿去用。',
    resultName: '正文',
    fields: [
      {
        key: 'url',
        label: '网页地址',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: 'https://example.com/article',
        hint: '把浏览器上方的网址复制进来即可',
      },
      {
        key: 'server',
        label: '阅读器地址',
        type: 'text',
        level: 'basic',
        placeholder: '不用填，已经帮你填好了',
        hint: '一般不用改。想换成别的抓取服务，才把你自己的地址填进来',
        vars: false,
      },
      {
        key: 'timeout',
        label: '最多等多少秒',
        type: 'number',
        level: 'advanced',
        min: 5,
        max: 120,
        step: 5,
        hint: '网页太慢一直转圈，可以调大一点',
        vars: false,
      },
      {
        key: 'tool',
        label: '用哪个功能',
        type: 'text',
        level: 'advanced',
        placeholder: '留空就自动挑',
        hint: '一般不用填。只有读不出内容时，才需要手动指定',
        vars: false,
      },
    ],
  },
};
