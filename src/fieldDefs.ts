// ============================================================
// 这个文件曾经装着全部节点的字段描述（1500 多行，改一次很难找）。
// 现在内容按类别搬到了 src/fields/ 目录下，这里只做一次转发，
// 目的是让所有 `import ... from '../fieldDefs'` 的地方继续能用。
//
// 新代码建议直接从 '../fields' 引入。
// ============================================================
export {
  NODE_FIELDS,
  VAR_FIELD,
  RAW_VAR_FIELD,
  SKILL_TARGETS,
  MODEL_FIELD,
  TEMPERATURE_FIELD,
  MAX_TOKENS_FIELD,
  primaryFieldOf,
  fieldAcceptsVars,
} from './fields';
