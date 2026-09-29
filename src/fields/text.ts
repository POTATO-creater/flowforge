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
// 文字处理类
// ============================================================
/** ============================================================
 *  文字处理类
 *  ============================================================ */
export const TEXT_FIELDS: Partial<Record<NodeKind, NodeFieldSpec>> = {
  markdown: {
    plain: '把「带记号写的文字」和「网页排版的文字」互相转一下，两种写法都能用。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '要转换的文字',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '点上面的按钮把前面节点的结果放进来',
        hint: '通常接在「让 AI 干活」后面，把 AI 写的结果转成网页能显示的样式',
      },
      {
        key: 'direction',
        label: '往哪个方向转',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'md2html', label: '转成网页排版' },
          { value: 'html2md', label: '转成带记号的写法' },
        ],
        vars: false,
      },
    ],
  },

  html: {
    plain: '网页那段代码里挑出你要的部分，比如所有标题、所有链接。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '网页代码',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '把「读网页」抓到的内容放进来',
        hint: '先用「读网页」把网页抓下来，再接到这里处理',
      },
      {
        key: 'op',
        label: '要做什么',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'toText', label: '去掉所有标签，只留文字' },
          { value: 'extract', label: '挑出指定的部分' },
        ],
        vars: false,
      },
      {
        key: 'selector',
        label: '挑什么样的部分',
        type: 'text',
        level: 'advanced',
        placeholder: '例如：h2 表示所有二级标题，a 表示所有链接',
        hint: '只有选「挑出指定的部分」时才用得上',
        vars: false,
      },
      {
        key: 'attr',
        label: '取它的哪一项',
        type: 'text',
        level: 'advanced',
        placeholder: '不填就取文字内容',
        hint: '比如链接要取 href，图片要取 src',
        vars: false,
      },
    ],
  },

  xml: {
    plain: '有些接口给的是「尖括号那套写法」，这里把它转成能直接读的样子，或者反过来。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '要转换的内容',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '把前面节点的结果放进来',
        hint: '接在「访问网址」后面最常见',
      },
      {
        key: 'direction',
        label: '往哪个方向转',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'xml2obj', label: '转成能读的样子' },
          { value: 'obj2xml', label: '转成尖括号写法' },
        ],
        vars: false,
      },
    ],
  },

  findreplace: {
    plain: '在文字里找出某个内容，换成别的。适合批量改名、清理多余符号。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '要处理的文字',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '把前面节点的结果放进来',
      },
      {
        key: 'find',
        label: '找出什么',
        type: 'text',
        level: 'basic',
        placeholder: '要替换掉的内容',
        hint: '留空就什么都不换',
        vars: false,
      },
      {
        key: 'replace',
        label: '换成什么',
        type: 'text',
        level: 'basic',
        placeholder: '留空表示直接删掉',
        vars: false,
      },
      {
        key: 'all',
        label: '全部都换吗',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'yes', label: '找到的都换' },
          { value: 'no', label: '只换第一处' },
        ],
        vars: false,
      },
      {
        key: 'ignoreCase',
        label: '大小写算不算一样',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'no', label: '算不一样' },
          { value: 'yes', label: '算一样' },
        ],
        vars: false,
      },
      {
        key: 'regex',
        label: '用高级匹配吗',
        type: 'select',
        level: 'advanced',
        options: [
          { value: 'no', label: '不用，就按原文找' },
          { value: 'yes', label: '用（会写规则的人用）' },
        ],
        hint: '不确定就选「不用」，免得规则写错',
        vars: false,
      },
    ],
  },

  slice: {
    plain: '从一段文字里截取其中一部分：按第几段来取，或者按第几个字到第几个字取。',
    resultName: '结果',
    fields: [
      {
        key: 'text',
        label: '要处理的文字',
        type: 'textarea',
        level: 'basic',
        primary: true,
        placeholder: '把前面节点的结果放进来',
      },
      {
        key: 'bySeparator',
        label: '怎么取',
        type: 'select',
        level: 'basic',
        options: [
          { value: 'yes', label: '按第几段取' },
          { value: 'no', label: '按第几个字取' },
        ],
        vars: false,
      },
      {
        key: 'separator',
        label: '按什么分段',
        type: 'text',
        level: 'advanced',
        placeholder: '不填就按换行分段',
        vars: false,
      },
      {
        key: 'index',
        label: '要第几段',
        type: 'number',
        level: 'advanced',
        min: 0,
        hint: '从 1 开始数：第 1 段就填 1',
        vars: false,
      },
      {
        key: 'from',
        label: '从第几个字开始',
        type: 'number',
        level: 'advanced',
        min: 0,
        hint: '从 1 开始数；留空或填 0 表示从头开始',
        vars: false,
      },
      {
        key: 'to',
        label: '到第几个字为止',
        type: 'number',
        level: 'advanced',
        min: 0,
        hint: '填 0 表示一直到结尾',
        vars: false,
      },
    ],
  },
};
