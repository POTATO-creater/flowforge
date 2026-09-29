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
// 流程控制补充（等一会儿 / 分多条路 / 出错就停）
// ============================================================
/** ============================================================
 *  流程控制补充
 *  ============================================================ */
export const FLOW_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  wait: {
    plain: '先等几秒再继续。用在需要给对端一点缓冲、或者不想请求太快的时候。',
    resultName: '内容',
    fields: [
      {
        key: 'seconds',
        label: '等几秒',
        type: 'number',
        level: 'basic',
        primary: true,
        min: 0,
        max: 60,
        hint: '最多 60 秒，太久了体验不好',
      },
    ],
  },

  switch: {
    plain: '看前面的内容里出现了哪个关键词，就让它走对应的那条路。可以有好多条路。',
    resultName: '判断',
    fields: [
      {
        key: 'routes',
        label: '怎么分路',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '一行一条，例如：\n新闻=走新闻那条\n教程=走教程那条',
        hint: '等号左边是关键词，右边是这条路的名字（会显示在节点右边的小圆点上）',
        vars: false,
      },
      {
        key: 'fallback',
        label: '哪个关键词都没出现怎么办',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'yes', label: '走「其它」那条路' },
          { value: 'no', label: '哪条都不走' },
        ],
        vars: false,
      },
    ],
  },

  stop: {
    plain: '到这里主动停下来并提示一句话。用来挡住不合格的内容，不让它继续往下走。',
    resultName: '内容',
    fields: [
      {
        key: 'message',
        label: '停下来时说什么',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '例如：内容太短了，先补齐再继续。',
        hint: '这句话会显示在运行记录里',
      },
      {
        key: 'when',
        label: '什么时候停',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'always', label: '每次到这里都停' },
          { value: 'ifEmpty', label: '上面没内容时才停' },
        ],
        vars: false,
      },
    ],
  },

  watch: {
    plain:
      '把它接到任意一个节点上，它就把那个节点跑出来的某一项直接显示出来。想看哪一项就填哪一项的名字。',
    resultName: '显示',
    fields: [
      {
        key: 'want',
        label: '想看哪一项',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '例如：正文、结果、图片',
        hint: '填上面那个节点里的某一项名字；留空就把它的全部内容显示出来',
        vars: false,
      },
      {
        key: 'note',
        label: '面板上写个小标题',
        type: 'text',
        level: 'advanced',
        placeholder: '例如：这一步的中间成果',
        hint: '只是给你自己看的备注，不影响结果',
        vars: false,
      },
    ],
  },
};
