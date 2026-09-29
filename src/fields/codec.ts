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
// 日期与编码类
// ============================================================
/** ============================================================
 *  日期与编码类
 *  ============================================================ */
export const CODEC_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  datetime: {
    plain: '拿当前时间、把日期换成别的写法、往后推几天、算两个日子差多少天。',
    resultName: '结果',
    fields: [
      {
        key: 'op',
        label: '要算什么',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'now', label: '取现在的时间' },
          { value: 'format', label: '把日期换个写法' },
          { value: 'add', label: '往后推 / 往前推几天' },
          { value: 'diff', label: '两个日子差几天' },
          { value: 'weekday', label: '这天是星期几' },
        ],
        vars: false,
      },
      {
        key: 'source',
        label: '要处理的日期',
        type: 'text',
        level: 'basic',
        placeholder: '点上面的按钮把前面节点的结果放进来',
        hint: '选「取现在的时间」时可以留空',
      },
      {
        key: 'format',
        label: '想显示成什么样',
        type: 'text',
        level: 'basic',
        placeholder: '例如：YYYY-MM-DD',
        hint: 'YYYY 是年，MM 是月，DD 是日，HH 是小时，mm 是分，ss 是秒',
        vars: false,
      },
      {
        key: 'amount',
        label: '推几天',
        type: 'number',
        level: 'advanced',
        hint: '正数是往后推，负数是往前推',
        vars: false,
      },
      {
        key: 'unit',
        label: '按什么单位推',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'day', label: '天' },
          { value: 'hour', label: '小时' },
          { value: 'minute', label: '分钟' },
          { value: 'month', label: '月' },
          { value: 'year', label: '年' },
        ],
        vars: false,
      },
      {
        key: 'target',
        label: '和哪一天比',
        type: 'text',
        level: 'advanced',
        placeholder: '例如：2026-12-31',
        hint: '只有选「两个日子差几天」时才用得上',
        vars: false,
      },
    ],
  },

  crypto: {
    plain: '给内容算一个「指纹」（内容变一点指纹就完全不同），或者生成一串随机字符。',
    resultName: '结果',
    fields: [
      {
        key: 'op',
        label: '要做什么',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'hash', label: '算一个指纹' },
          { value: 'hmac', label: '带密钥算一个签名' },
          { value: 'random', label: '生成一串随机字符' },
        ],
        vars: false,
      },
      {
        key: 'text',
        label: '要给什么内容算',
        type: 'textarea',
        level: 'basic',
        placeholder: '点上面的按钮把前面节点的结果放进来',
        hint: '只有生成随机字符时不用填',
      },
      {
        key: 'algorithm',
        label: '用哪种算法',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'SHA-256', label: 'SHA-256（常用）' },
          { value: 'SHA-1', label: 'SHA-1（老一些）' },
          { value: 'SHA-384', label: 'SHA-384' },
          { value: 'SHA-512', label: 'SHA-512（更长更安全）' },
        ],
        hint: '不确定就用 SHA-256',
        vars: false,
      },
      {
        key: 'secret',
        label: '密钥',
        type: 'text',
        level: 'advanced',
        placeholder: '只有算签名时才需要填',
        vars: false,
      },
      {
        key: 'length',
        label: '生成多长',
        type: 'number',
        level: 'advanced',
        min: 1,
        hint: '想要几个字符就填几',
        vars: false,
      },
      {
        key: 'randomKind',
        label: '随机字符里放什么',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'alnum', label: '字母加数字' },
          { value: 'hex', label: '只用 0-9 和 a-f' },
          { value: 'number', label: '只用数字' },
        ],
        vars: false,
      },
    ],
  },

  encode: {
    plain: '把文字换一种存放方式，或者把换过的写法还原回来。常见于处理网址和乱码。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '要转换的文字',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '点上面的按钮把前面节点的结果放进来',
      },
      {
        key: 'op',
        label: '怎么转',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'b64enc', label: '换成一串字母数字' },
          { value: 'b64dec', label: '从字母数字还原回来' },
          { value: 'urlenc', label: '换成网址里能用的样子' },
          { value: 'urldec', label: '从网址写法还原回来' },
          { value: 'htmlenc', label: '换成网页代码里的写法' },
          { value: 'htmldec', label: '从网页代码写法还原回来' },
        ],
        vars: false,
      },
    ],
  },

  totp: {
    plain: '按密钥生成一个几十秒就换一次的口令，和手机上的验证器是同一套算法。',
    resultName: '口令',
    fields: [
      {
        key: 'secret',
        label: '口令密钥',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '一串大写字母和数字',
        hint: '就是绑定验证器时给出的那串密钥，比如 JBSWY3DPEHPK3PXP',
        vars: false,
      },
      {
        key: 'digits',
        label: '口令有几位',
        type: 'number',
        level: 'advanced',
        min: 4,
        max: 10,
        hint: '一般是 6 位',
        vars: false,
      },
      {
        key: 'period',
        label: '多少秒换一次',
        type: 'number',
        level: 'advanced',
        min: 1,
        hint: '一般是 30 秒',
        vars: false,
      },
      {
        key: 'algorithm',
        label: '用哪种算法',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'SHA-1', label: 'SHA-1（最常见）' },
          { value: 'SHA-256', label: 'SHA-256' },
          { value: 'SHA-512', label: 'SHA-512' },
        ],
        vars: false,
      },
    ],
  },

  jwt: {
    plain: '把一串登录凭证解开看里面写了什么，或者按内容生成一串。',
    resultName: '结果',
    fields: [
      {
        key: 'op',
        label: '要做什么',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'decode', label: '解开看看里面写了什么' },
          { value: 'sign', label: '按内容生成一串' },
        ],
        vars: false,
      },
      {
        key: 'token',
        label: '那串凭证',
        type: 'textarea',
        level: 'basic',
        placeholder: '形如 aaa.bbb.ccc 的一长串',
        hint: '只有「解开看看」时才用得上',
      },
      {
        key: 'payload',
        label: '里面要写什么',
        type: 'textarea',
        level: 'advanced',
        placeholder: '例如：{"user":"小明"}',
        hint: '只有「生成一串」时才用得上',
        vars: false,
      },
      {
        key: 'secret',
        label: '密钥',
        type: 'text',
        level: 'advanced',
        placeholder: '生成时需要填',
        vars: false,
      },
    ],
  },
};
