import { useState, useRef, useCallback } from 'react';
import { useFlowStore } from '../store/flowStore';
import { NODE_METAS } from '../nodeMeta';
import {
  NODE_FIELDS,
  VAR_FIELD,
  SKILL_TARGETS,
  primaryFieldOf,
  fieldAcceptsVars,
} from '../fieldDefs';
import type { FieldDef, NodeConfig, FlowNodeData } from '../types';
import { TrashIcon, SparkIcon, ArrowLeftIcon } from '../lib/icons';
import { readableOutput, outputImage } from '../lib/preview';

/** 上游节点信息：用于「把上游结果放进来」按钮 */
interface UpstreamRef {
  id: string;
  label: string;
  resultName: string;
  /** 插入文本时使用的 token */
  token: string;
}

export function Inspector() {
  const selectedId = useFlowStore((s) => s.selectedId);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const mode = useFlowStore((s) => s.mode);
  const skills = useFlowStore((s) => s.skills);
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const renameNode = useFlowStore((s) => s.renameNode);
  const deleteNode = useFlowStore((s) => s.deleteNode);
  const applySkill = useFlowStore((s) => s.applySkill);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [skillId, setSkillId] = useState('');
  // 当前聚焦的字段，决定「上游结果」按钮插到哪个框里
  const [focusField, setFocusField] = useState<string>('');
  const fieldRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});

  const registerRef = useCallback(
    (key: string) => (el: HTMLTextAreaElement | HTMLInputElement | null) => {
      fieldRefs.current[key] = el;
    },
    [],
  );

  if (!node || !selectedId) {
    return (
      <aside className="inspector">
        <div className="inspector__empty">
          点一个节点，就能在这里设置它。
          <br />
          还不知道从哪开始？从左边拖一个节点到画布上试试。
        </div>
      </aside>
    );
  }

  const kind = node.data.kind;
  const meta = NODE_METAS[kind];
  const spec = NODE_FIELDS[kind];
  const cfg = node.data.config as unknown as Record<string, unknown>;
  const primary = primaryFieldOf(kind);
  // 这次结果如果是图，就真把图显示出来
  const pic = node.data.run?.status === 'success' ? outputImage(node.data.run.output) : '';

  // 小白模式：只留主字段（1 个）；大佬模式：基础字段全显示
  const basicFields =
    mode === 'basic'
      ? spec.fields.filter((f) => f.key === primary)
      : spec.fields.filter((f) => f.level === 'basic');
  const advancedFields = spec.fields.filter(
    (f) => f.level === 'advanced' && f.key !== primary,
  );
  const showAdvancedBlock = mode === 'pro' || showAdvanced;

  // —— 上游节点：图上真正连到本节点的那些 ——
  const upstream: UpstreamRef[] = edges
    .filter((e) => e.target === selectedId)
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .filter((n, i, arr) => arr.findIndex((x) => x.id === n.id) === i)
    .map((n) => {
      const rn = NODE_FIELDS[n.data.kind].resultName ?? VAR_FIELD[n.data.kind];
      return {
        id: n.id,
        label: n.data.label,
        resultName: rn,
        token: `{{${n.data.label}.${rn}}}`,
      };
    });

  const setField = (key: string, value: unknown) => {
    updateNodeConfig(selectedId, { [key]: value } as unknown as Partial<NodeConfig>);
  };

  /** 把上游结果插到指定字段的光标处 */
  const insertToken = (key: string, token: string) => {
    const el = fieldRefs.current[key];
    const cur = cfg[key];
    const text = typeof cur === 'string' ? cur : '';

    // 已经有了、且是唯一内容时，就不重复插一遍（避免误点出现两份）
    if (text.trim() === token) {
      el?.focus();
      return;
    }

    // 有光标位置就插在光标处，否则追加到末尾
    const start = el && typeof el.selectionStart === 'number' ? el.selectionStart : text.length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : text.length;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const next = before + token + after;
    setField(key, next);

    // 插完把光标移到插入内容之后
    requestAnimationFrame(() => {
      const target = fieldRefs.current[key];
      if (target && 'setSelectionRange' in target) {
        const pos = start + token.length;
        target.focus();
        target.setSelectionRange(pos, pos);
      }
    });
  };

  const skillField = SKILL_TARGETS[kind];
  const applicableSkills = skillField ? skills : [];

  const onApplySkill = (append: boolean) => {
    if (!skillField || !skillId) return;
    applySkill(selectedId, skillId, skillField, append);
    setSkillId('');
  };

  // 当前该往哪个字段插：优先用户聚焦的，否则主字段
  const activeField = focusField || primary;
  const activeAcceptsVars = (() => {
    const d = spec.fields.find((f) => f.key === activeField);
    return d ? fieldAcceptsVars(d) : false;
  })();

  return (
    <aside className="inspector">
      <div className="inspector__head">
        <div className="inspector__kicker" style={{ color: `var(${meta.colorVar})` }}>
          {meta.name}
        </div>
        <div className="inspector__title">
          <input
            className="input"
            style={{ flex: 1, fontWeight: 600 }}
            value={node.data.label}
            onChange={(e) => renameNode(selectedId, e.target.value)}
            aria-label="节点名字"
          />
          <button
            className="btn btn--icon btn--danger"
            onClick={() => deleteNode(selectedId)}
            title="删掉这个节点"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="inspector__body">
        <div className="inspector__plain">{spec.plain}</div>

        {/* —— 上游结果：点一下就放进输入框 —— */}
        {activeAcceptsVars && (
          <div className="upstream">
            <div className="upstream__label">
              <ArrowLeftIcon size={13} />
              把前面节点的结果放进来
            </div>
            {upstream.length > 0 ? (
              <div className="upstream__list">
                {upstream.map((u) => (
                  <button
                    key={u.id}
                    className="upstream__btn"
                    onClick={() => insertToken(activeField, u.token)}
                    title={`插入「${u.label}」的结果`}
                  >
                    <span className="upstream__name">{u.label}</span>
                    <span className="upstream__res">{u.resultName}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="upstream__hint">
                这个节点还没接上任何东西。从别的节点拉一条线连过来，就能用它的结果了。
              </div>
            )}
          </div>
        )}

        {/* —— 应用技能 —— */}
        {applicableSkills.length > 0 && (
          <div className="field">
            <span className="field__label">
              <span className="field__label-inner">
                <SparkIcon size={13} /> 套用一个技能
              </span>
              <span className="field__hint">技能 = 一整套写好的要求</span>
            </span>
            <div className="skill-apply">
              <select className="select" value={skillId} onChange={(e) => setSkillId(e.target.value)}>
                <option value="">挑一个技能…</option>
                {applicableSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div className="skill-apply__btns">
                <button
                  className="btn"
                  disabled={!skillId}
                  onClick={() => onApplySkill(true)}
                  title="保留原来写的，把技能接在后面"
                >
                  接在后面
                </button>
                <button
                  className="btn"
                  disabled={!skillId}
                  onClick={() => onApplySkill(false)}
                  title="用技能把原来写的替换掉"
                >
                  直接替换
                </button>
              </div>
            </div>
            {skillId && <span className="field__hint">{skills.find((s) => s.id === skillId)?.desc}</span>}
          </div>
        )}

        {/* —— 主要设置 —— */}
        {basicFields.map((f) => (
          <FieldInput
            key={f.key}
            def={f}
            value={cfg[f.key]}
            onChange={(v) => setField(f.key, v)}
            onFocus={() => setFocusField(f.key)}
            inputRef={registerRef(f.key)}
          />
        ))}

        {/* —— 更多设置 —— */}
        {advancedFields.length > 0 &&
          (mode === 'pro' ? (
            <>
              <div className="inspector__divider">更多设置</div>
              {advancedFields.map((f) => (
                <FieldInput
                  key={f.key}
                  def={f}
                  value={cfg[f.key]}
                  onChange={(v) => setField(f.key, v)}
                  onFocus={() => setFocusField(f.key)}
                  inputRef={registerRef(f.key)}
                />
              ))}
            </>
          ) : (
            <>
              <button
                className="accordion"
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
              >
                <span>还有 {advancedFields.length} 项可选设置</span>
                <span className={`accordion__caret ${showAdvanced ? 'is-open' : ''}`}>▾</span>
              </button>
              {showAdvancedBlock &&
                advancedFields.map((f) => (
                  <FieldInput
                    key={f.key}
                    def={f}
                    value={cfg[f.key]}
                    onChange={(v) => setField(f.key, v)}
                    onFocus={() => setFocusField(f.key)}
                    inputRef={registerRef(f.key)}
                  />
                ))}
            </>
          ))}

        {/* —— 跑完之后的结果 —— */}
        {node.data.run && (
          <div className="field">
            <span className="field__label">
              这次跑出来的结果
              <span className="tag" style={{ color: `var(--st-${node.data.run.status})` }}>
                {STATUS_TEXT[node.data.run.status]}
                {node.data.run.durationMs != null ? ` · ${node.data.run.durationMs}毫秒` : ''}
              </span>
            </span>

            {/* 结果是一张图，就真把图放出来，而不是只给一句话 */}
            {node.data.run.status === 'success' && pic && (
              <a
                className="logs__image"
                href={pic}
                target="_blank"
                rel="noreferrer"
                title="点一下看大图（在新标签打开）"
              >
                <img src={pic} alt="这次跑出来的图" />
                <span className="logs__image-tip">点图可以看大图</span>
              </a>
            )}

            <pre className="logs__detail" style={{ maxHeight: 160 }}>
              {node.data.run.error
                ? `出错了：${node.data.run.error}`
                : pic
                  ? '图片就在上面，点一下能看大图。'
                  : prettyOutput(node.data.run.output)}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
}

/** 运行状态的中文说法 */
const STATUS_TEXT: Record<NonNullable<FlowNodeData['run']>['status'], string> = {
  idle: '还没跑',
  running: '正在跑',
  success: '顺利完成',
  error: '出错了',
};

/** 把运行结果转成给人看的文字 */
function prettyOutput(out: Record<string, unknown> | undefined): string {
  const text = readableOutput(out);
  return text || '（没有内容）';
}

// ============================================================
// 通用输入控件：由字段描述驱动，新增节点无需改这里
// ============================================================
function FieldInput({
  def,
  value,
  onChange,
  onFocus,
  inputRef,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  onFocus?: () => void;
  inputRef?: (el: HTMLTextAreaElement | HTMLInputElement | null) => void;
}) {
  const label = (
    <span className="field__label">
      {def.label}
      {def.hint && <span className="field__hint">{def.hint}</span>}
    </span>
  );

  // 滑块：两端是人话说明
  if (def.type === 'slider') {
    const num = typeof value === 'number' ? value : Number(value ?? 0);
    return (
      <div className="field">
        {label}
        <div className="slider">
          <span className="slider__end">{def.ends?.[0]}</span>
          <input
            className="slider__input"
            type="range"
            min={def.min}
            max={def.max}
            step={def.step}
            value={num}
            onChange={(e) => onChange(Number(e.target.value))}
            onFocus={onFocus}
          />
          <span className="slider__end">{def.ends?.[1]}</span>
        </div>
      </div>
    );
  }

  if (def.type === 'number') {
    return (
      <div className="field">
        {label}
        <input
          className="input"
          type="number"
          value={typeof value === 'number' ? value : Number(value ?? 0)}
          min={def.min}
          max={def.max}
          step={def.step}
          onFocus={onFocus}
          ref={inputRef as (el: HTMLInputElement | null) => void}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    );
  }

  if (def.type === 'select') {
    return (
      <div className="field">
        {label}
        <select
          className="select"
          value={String(value ?? '')}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
        >
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
        {label}
        <textarea
          className={`textarea${def.type === 'code' ? ' input--mono' : ''}`}
          value={typeof value === 'string' ? value : ''}
          placeholder={def.placeholder}
          spellCheck={false}
          onFocus={onFocus}
          ref={inputRef as (el: HTMLTextAreaElement | null) => void}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="field">
      {label}
      <input
        className="input"
        value={typeof value === 'string' ? value : ''}
        placeholder={def.placeholder}
        spellCheck={false}
        onFocus={onFocus}
        ref={inputRef as (el: HTMLInputElement | null) => void}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
