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
// 数据整理类（纯函数，不联网）
// ============================================================
/** ============================================================
 *  数据整理类（纯函数，不联网）
 *  ============================================================ */
export const DATA_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  pick: {
    plain: '前面给过来的东西可能有好几项，这里只留下你真正要用的那几项。',
    resultName: '结果',
    fields: [
      {
        key: 'fields',
        label: '要留下哪几项',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '例如：标题, 作者',
        hint: '用逗号隔开。名字要和前面的内容对得上，不对应的会被丢掉',
        vars: false,
      },
      {
        key: 'missing',
        label: '找不到的项怎么办',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'skip', label: '直接不要了' },
          { value: 'empty', label: '留个空位' },
        ],
        hint: '前面没有这一项时，是跳过还是留空',
        vars: false,
      },
    ],
  },

  filter: {
    plain: '把一堆内容按关键词筛一遍，只要符合条件的，其余的丢掉。',
    resultName: '结果',
    fields: [
      {
        key: 'keyword',
        label: '看关键词',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '例如：AI',
        hint: '留空就一条都不筛，原样往下传',
        vars: false,
      },
      {
        key: 'mode',
        label: '怎么算符合',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'contains', label: '含有这个词' },
          { value: 'notContains', label: '不含这个词' },
          { value: 'startsWith', label: '以它开头' },
          { value: 'endsWith', label: '以它结尾' },
        ],
        vars: false,
      },
    ],
  },

  sort: {
    plain: '把一堆内容按顺序排好。可以按文字先后、按长短、或按数字大小。',
    resultName: '结果',
    fields: [
      {
        key: 'by',
        label: '按什么排',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'text', label: '按文字先后' },
          { value: 'length', label: '按长短' },
          { value: 'number', label: '按数字大小' },
        ],
        vars: false,
      },
      {
        key: 'order',
        label: '从小到大还是从大到小',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'asc', label: '从小到大' },
          { value: 'desc', label: '从大到小' },
        ],
        vars: false,
      },
    ],
  },

  limit: {
    plain: '内容太多的时候，只留下前面几条（或者最后几条），后面的不要了。',
    resultName: '结果',
    fields: [
      {
        key: 'count',
        label: '留下几条',
        type: 'number',
        level: 'basic',
        primary: true,
        min: 1,
        placeholder: '例如：5',
        hint: '填 0 表示不限制，全都留下',
        vars: false,
      },
      {
        key: 'from',
        label: '从头数还是从尾数',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'head', label: '留最前面的' },
          { value: 'tail', label: '留最后面的' },
        ],
        vars: false,
      },
    ],
  },

  dedupe: {
    plain: '一堆内容里如果有重复的，只保留一条，其余的删掉。',
    resultName: '结果',
    fields: [
      {
        key: 'ignoreCase',
        label: '大小写算不算一样',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'no', label: '算不一样' },
          { value: 'yes', label: '算一样' },
        ],
        hint: '比如 Hello 和 hello 是否当作同一条',
        vars: false,
      },
    ],
  },

  splitout: {
    plain: '把一大段内容按某个记号切开，变成一条一条的，方便后面逐条处理。',
    resultName: '结果',
    fields: [
      {
        key: 'separator',
        label: '按什么切开',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '不填就按换行切',
        hint: '填一个出现的记号即可，比如 --- 或换行',
        vars: false,
      },
    ],
  },

  aggregate: {
    plain: '把好几条内容合到一起当成一组，交给后面的节点一起处理。',
    resultName: '结果',
    fields: [
      {
        key: 'separator',
        label: '合并时中间加什么',
        type: 'text',
        level: 'basic',
        primary: true,
        placeholder: '不填就直接接上',
        hint: '想让每条之间空一行，可以填 \\n\\n',
        vars: false,
      },
    ],
  },

  summarize: {
    plain: '对一堆数字做点计算：数个数、求和、算平均、找最大最小。',
    resultName: '结果',
    fields: [
      {
        key: 'op',
        label: '算什么',
        type: 'select',
        level: 'basic',
        primary: true,
        options: [
          { value: 'count', label: '数一数有几条' },
          { value: 'sum', label: '加起来是多少' },
          { value: 'average', label: '平均是多少' },
          { value: 'max', label: '最大是多少' },
          { value: 'min', label: '最小是多少' },
          { value: 'unique', label: '不重复的有几条' },
          { value: 'join', label: '直接连成一段' },
        ],
        vars: false,
      },
      {
        key: 'separator',
        label: '连成一段时中间加什么',
        type: 'text',
        level: 'advanced',
        placeholder: '不填就按换行',
        hint: '只有选「直接连成一段」时才用得上',
        vars: false,
      },
    ],
  },

  renamekeys: {
    plain: '把内容里各项的名字换成你想要的名字，方便后面统一引用。',
    resultName: '结果',
    fields: [
      {
        key: 'mapping',
        label: '怎么改',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '一行一条，例如：\n原标题=新标题\n原作者=作者',
        hint: '等号左边是原来的名字，右边是想改成的名字',
        vars: false,
      },
    ],
  },
};
