import { useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import { NODE_METAS } from '../nodeMeta';
import { NODE_FIELDS, VAR_FIELD, SKILL_TARGETS, primaryFieldOf } from '../fieldDefs';
import type { FieldDef, NodeConfig } from '../types';
import { TrashIcon, SparkIcon } from '../lib/icons';

export function Inspector() {
  const selectedId = useFlowStore((s) => s.selectedId);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const nodes = useFlowStore((s) => s.nodes);
  const mode = useFlowStore((s) => s.mode);
  const skills = useFlowStore((s) => s.skills);
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const renameNode = useFlowStore((s) => s.renameNode);
  const deleteNode = useFlowStore((s) => s.deleteNode);
  const applySkill = useFlowStore((s) => s.applySkill);

  // 小白模式下「高级设置」手风琴的展开态
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [skillId, setSkillId] = useState('');

  if (!node || !selectedId) {
    return (
      <aside className="inspector">
        <div className="inspector__empty">
          选中一个节点以编辑其配置。
          <br />
          或从左侧把节点拖到画布开始搭建。
        </div>
      </aside>
    );
  }

  const kind = node.data.kind;
  const meta = NODE_METAS[kind];
  const spec = NODE_FIELDS[kind];
  const cfg = node.data.config as unknown as Record<string, unknown>;
  const primary = primaryFieldOf(kind);

  const basicFields = spec.fields.filter((f) => f.level === 'basic');
  const advancedFields = spec.fields.filter((f) => f.level === 'advanced');
  // 大佬模式全部平铺；小白模式基础字段常驻、高级字段折叠
  const showAdvancedBlock = mode === 'pro' || showAdvanced;

  // 可用变量：其它节点
  const vars = nodes
    .filter((n) => n.id !== selectedId)
    .map((n) => ({ id: n.id, field: VAR_FIELD[n.data.kind], label: n.data.label }));

  const setField = (key: string, value: unknown) => {
    updateNodeConfig(selectedId, { [key]: value } as unknown as Partial<NodeConfig>);
  };

  const insertVar = (id: string, field: string) => {
    const cur = cfg[primary];
    const text = typeof cur === 'string' ? cur : '';
    const token = `{{${id}.${field}}}`;
    setField(primary, text + (text && !text.endsWith(' ') ? ' ' : '') + token);
  };

  // 技能只对含 System Prompt 的节点开放
  const skillField = SKILL_TARGETS[kind];
  const applicableSkills = skillField ? skills : [];

  const onApplySkill = (append: boolean) => {
    if (!skillField || !skillId) return;
    applySkill(selectedId, skillId, skillField, append);
    setSkillId('');
  };

  return (
    <aside className="inspector">
      <div className="inspector__head">
        <div className="inspector__kicker" style={{ color: `var(${meta.colorVar})` }}>
          {meta.name}
          {mode === 'basic' && <span className="inspector__mode-tag">小白模式</span>}
        </div>
        <div className="inspector__title">
          <input
            className="input"
            style={{ flex: 1, fontWeight: 600 }}
            value={node.data.label}
            onChange={(e) => renameNode(selectedId, e.target.value)}
            aria-label="节点名称"
          />
          <button className="btn btn--icon btn--danger" onClick={() => deleteNode(selectedId)} title="删除节点">
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="inspector__body">
        {/* 小白模式：一句话说明这个节点干什么 */}
        {mode === 'basic' && <div className="inspector__plain">{spec.plain}</div>}

        {/* 可用变量 */}
        {vars.length > 0 && (
          <div className="field">
            <span className="field__label">
              可用变量
              <span className="field__hint">点击插入到「{labelOf(kind, primary)}」</span>
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {vars.map((v) => (
                <button
                  key={v.id}
                  className="varhint"
                  onClick={() => insertVar(v.id, v.field)}
                  title={`来自节点「${v.label}」`}
                >
                  {`{{${v.id}.${v.field}}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 应用技能：仅含 System Prompt 的节点 */}
        {applicableSkills.length > 0 && (
          <div className="field">
            <span className="field__label">
              <span className="field__label-inner">
                <SparkIcon size={13} /> 应用技能
              </span>
            </span>
            <div className="skill-apply">
              <select className="select" value={skillId} onChange={(e) => setSkillId(e.target.value)}>
                <option value="">选择一个技能…</option>
                {applicableSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div className="skill-apply__btns">
                <button className="btn" disabled={!skillId} onClick={() => onApplySkill(true)} title="保留原有内容，追加技能">
                  追加
                </button>
                <button className="btn" disabled={!skillId} onClick={() => onApplySkill(false)} title="用技能覆盖原有内容">
                  覆盖
                </button>
              </div>
            </div>
            {skillId && <span className="field__hint">{skills.find((s) => s.id === skillId)?.desc}</span>}
          </div>
        )}

        {/* 基础字段 */}
        {basicFields.map((f) => (
          <FieldInput key={f.key} def={f} value={cfg[f.key]} onChange={(v) => setField(f.key, v)} />
        ))}

        {/* 高级字段：大佬模式平铺；小白模式折叠 */}
        {advancedFields.length > 0 &&
          (mode === 'pro' ? (
            <>
              <div className="inspector__divider">高级设置</div>
              {advancedFields.map((f) => (
                <FieldInput key={f.key} def={f} value={cfg[f.key]} onChange={(v) => setField(f.key, v)} />
              ))}
            </>
          ) : (
            <>
              <button className="accordion" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}>
                <span>高级设置</span>
                <span className="accordion__count">{advancedFields.length} 项</span>
                <span className={`accordion__caret ${showAdvanced ? 'is-open' : ''}`}>▾</span>
              </button>
              {showAdvancedBlock &&
                advancedFields.map((f) => (
                  <FieldInput key={f.key} def={f} value={cfg[f.key]} onChange={(v) => setField(f.key, v)} />
                ))}
            </>
          ))}

        {/* 运行结果 */}
        {node.data.run && (
          <div className="field">
            <span className="field__label">
              运行结果
              <span className="tag" style={{ color: `var(--st-${node.data.run.status})` }}>
                {node.data.run.status}
                {node.data.run.durationMs != null ? ` · ${node.data.run.durationMs}ms` : ''}
              </span>
            </span>
            <pre className="logs__detail" style={{ maxHeight: 160 }}>
              {node.data.run.error
                ? `错误：${node.data.run.error}`
                : JSON.stringify(node.data.run.output ?? null, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
}

function labelOf(kind: string, key: string): string {
  const spec = NODE_FIELDS[kind as keyof typeof NODE_FIELDS];
  return spec?.fields.find((f) => f.key === key)?.label ?? key;
}

// ============================================================
// 通用字段渲染：由 FieldDef 驱动，新增节点无需改这里
// ============================================================
function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const common = {
    className: def.type === 'code' ? 'textarea input--mono' : def.type === 'text' ? 'input' : 'input',
  };

  if (def.type === 'number') {
    return (
      <div className="field">
        <span className="field__label">
          {def.label}
          {def.hint && <span className="field__hint">{def.hint}</span>}
        </span>
        <input
          className="input"
          type="number"
          value={typeof value === 'number' ? value : Number(value ?? 0)}
          min={def.min}
          max={def.max}
          step={def.step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    );
  }

  if (def.type === 'select') {
    return (
      <div className="field">
        <span className="field__label">
          {def.label}
          {def.hint && <span className="field__hint">{def.hint}</span>}
        </span>
        <select className="select" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (def.type === 'textarea' || def.type === 'code') {
    return (
      <div className="field">
        <span className="field__label">
          {def.label}
          {def.hint && <span className="field__hint">{def.hint}</span>}
        </span>
        <textarea
          className={`textarea${def.type === 'code' ? ' input--mono' : ''}`}
          value={typeof value === 'string' ? value : ''}
          placeholder={def.placeholder}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="field">
      <span className="field__label">
        {def.label}
        {def.hint && <span className="field__hint">{def.hint}</span>}
      </span>
      <input
        {...common}
        value={typeof value === 'string' ? value : ''}
        placeholder={def.placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
