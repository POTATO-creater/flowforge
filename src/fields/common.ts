// ============================================================
// 各节点的字段描述：驱动 Inspector 通用渲染 + 简单点/全都要模式分级
//
// 【写作规范】所有 label / hint / placeholder 必须是大白话。
// 禁止出现：token、JSON、System Prompt、API、表达式、插值、
//          HTML、Markdown、布尔、变量名等技术词。
// 变量一律使用中文：{{节点名.结果名}}
// ============================================================


import type { FieldDef } from '../types';

// ============================================================
// 各节点共用的小字段（用哪个 AI、回答风格、回复最长多少字）
// ============================================================
export const MODEL_FIELD: FieldDef = {
  key: 'model',
  label: '用哪个 AI',
  type: 'text',
  level: 'basic',
  placeholder: '不用填，默认用设置里的那个',
  hint: '留空就行，除非你想换个 AI 试试',
  vars: false,
};

/** 回答风格：用滑块代替「发散程度」，两端是人话 */
export const TEMPERATURE_FIELD: FieldDef = {
  key: 'temperature',
  label: '回答风格',
  type: 'slider',
  level: 'basic',
  min: 0,
  max: 1,
  step: 0.1,
  ends: ['老老实实的', '天马行空的'],
  hint: '偏左更稳更准，偏右更活更放得开',
  vars: false,
};

export const MAX_TOKENS_FIELD: FieldDef = {
  key: 'maxTokens',
  label: '回复最长多少字',
  type: 'number',
  level: 'advanced',
  min: 100,
  step: 100,
  hint: '大概的字数，不够长就往大调',
  vars: false,
};
