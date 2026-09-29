// ============================================================
// 字段表的汇总入口
//
// 这个文件以前是一个 1500 多行的单文件（src/fieldDefs.ts）。现在按
// 「数据整理 / 文字处理 / 日期与编码 / 网络 / 流程」拆到 fields/ 下，
// 每类一个文件，好找好改。
//
// 【兼容性】对外的导出名一个都没变，所有 import 方都不用动。
// ============================================================
import type { NodeKind, NodeFieldSpec, FieldDef } from '../types';

import { BASE_FIELDS } from './base';
import { DATA_FIELDS } from './data';
import { TEXT_FIELDS } from './text';
import { CODEC_FIELDS } from './codec';
import { NET_FIELDS } from './net';
import { FLOW_FIELDS } from './flow';
import { MEDIA_FIELDS } from './media';

export { VAR_FIELD, RAW_VAR_FIELD, SKILL_TARGETS } from './vars';
export { MODEL_FIELD, TEMPERATURE_FIELD, MAX_TOKENS_FIELD } from './common';

/**
 * 完整字段表 = 原有节点 + 数据整理 + 文字处理 + 日期与编码 + 网络 + 流程 + 出图。
 *
 * 合并后断言为 Record<NodeKind, ...>，所以
 * 【任何一类漏登记某个节点，这里都会编译报错】。
 */
export const NODE_FIELDS = Object.assign(
  {},
  BASE_FIELDS,
  DATA_FIELDS,
  TEXT_FIELDS,
  CODEC_FIELDS,
  NET_FIELDS,
  FLOW_FIELDS,
  MEDIA_FIELDS,
) as Record<NodeKind, NodeFieldSpec>;

export function primaryFieldOf(kind: NodeKind): string {
  const spec = NODE_FIELDS[kind];
  const found = spec.fields.find((f) => f.primary);
  return found?.key ?? spec.fields[0]?.key ?? '';
}

/** 该字段是否允许插入上游结果（默认：文本框 / 多行框 / 代码框） */
export function fieldAcceptsVars(def: FieldDef): boolean {
  if (def.vars !== undefined) return def.vars;
  return def.type === 'text' || def.type === 'textarea' || def.type === 'code';
}
