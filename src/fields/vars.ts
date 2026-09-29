// ============================================================
// 各节点的字段描述：驱动 Inspector 通用渲染 + 简单点/全都要模式分级
//
// 【写作规范】所有 label / hint / placeholder 必须是大白话。
// 禁止出现：token、JSON、System Prompt、API、表达式、插值、
//          HTML、Markdown、布尔、变量名等技术词。
// 变量一律使用中文：{{节点名.结果名}}
// ============================================================

import type { NodeKind } from '../types';

// ============================================================
// 结果名对照表
//
// 「结果名」是给用户看的中文外号（界面上写 节点名.结果名）；
// 「真实字段名」是引擎产出对象上真正用的键。两者必须成对维护：
// 少了任何一边，变量要么显示不出来，要么取到空值。
// ============================================================
/**
 * 该节点产出对外暴露的「结果名」——这是给用户看的中文名，
 * 界面上写 {{节点名.结果名}} 时用的就是它。
 */
export const VAR_FIELD: Record<NodeKind, string> = {
  start: '内容',
  llm: '结果',
  chain: '答案',
  agent: '回答',
  tool: '返回',
  fetch: '正文',
  condition: '判断',
  merge: '汇总',
  loop: '结果',
  code: '结果',
  output: '内容',
  pick: '结果',
  filter: '结果',
  sort: '结果',
  limit: '结果',
  dedupe: '结果',
  splitout: '结果',
  aggregate: '结果',
  summarize: '结果',
  renamekeys: '结果',
  markdown: '结果',
  html: '结果',
  xml: '结果',
  findreplace: '结果',
  slice: '结果',
  datetime: '结果',
  crypto: '结果',
  encode: '结果',
  totp: '口令',
  jwt: '结果',
  hn: '榜单',
  rss: '文章',
  chart: '图片',
  fact: '内容',
  mcpFetch: '正文',
  wait: '内容',
  switch: '判断',
  stop: '内容',
  watch: '显示',
  imageGen: '图片',
  imageEdit: '图片',
  imageMix: '图片',
};

/**
 * 引擎内部真实使用的字段名。
 * 【不要与 VAR_FIELD 混用】VAR_FIELD 是给人看的外号，
 * 这里才是 output 对象上真实存在的键，变量解析必须落到这里。
 */
export const RAW_VAR_FIELD: Record<NodeKind, string> = {
  start: 'text',
  llm: 'content',
  chain: 'content',
  agent: 'content',
  tool: 'body',
  fetch: 'content',
  condition: 'branch',
  merge: 'text',
  loop: 'text',
  code: 'result',
  output: 'text',
  pick: 'result',
  filter: 'result',
  sort: 'result',
  limit: 'result',
  dedupe: 'result',
  splitout: 'result',
  aggregate: 'result',
  summarize: 'result',
  renamekeys: 'result',
  markdown: 'result',
  html: 'result',
  xml: 'result',
  findreplace: 'result',
  slice: 'result',
  datetime: 'result',
  crypto: 'result',
  encode: 'result',
  totp: 'code',
  jwt: 'result',
  hn: 'list',
  rss: 'list',
  chart: 'url',
  fact: 'text',
  mcpFetch: 'content',
  wait: 'text',
  switch: 'branch',
  stop: 'text',
  watch: 'shown',
  imageGen: 'image',
  imageEdit: 'image',
  imageMix: 'image',
};

/** 节点内可用于「套用一个技能」的字段（含长期要求的节点） */
export const SKILL_TARGETS: Partial<Record<NodeKind, string>> = {
  llm: 'system',
  chain: 'guide',
  agent: 'system',
  loop: 'system',
};
