import { useFlowStore } from '../store/flowStore';
import { NODE_METAS } from '../nodeMeta';
import type {
  NodeKind,
  StartConfig,
  LLMConfig,
  ToolConfig,
  ConditionConfig,
  CodeConfig,
  OutputConfig,
  FlowNodeData,
} from '../types';
import { TrashIcon } from '../lib/icons';

/** 每个节点类型的主文本字段（用于变量快捷插入）与默认引用字段 */
const PRIMARY_FIELD: Record<NodeKind, string> = {
  start: 'text',
  llm: 'prompt',
  tool: 'url',
  condition: 'expression',
  code: 'expression',
  output: 'template',
};
const VAR_FIELD: Record<NodeKind, string> = {
  start: 'text',
  llm: 'content',
  tool: 'body',
  condition: 'branch',
  code: 'result',
  output: 'text',
};

export function Inspector() {
  const selectedId = useFlowStore((s) => s.selectedId);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const nodes = useFlowStore((s) => s.nodes);
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const renameNode = useFlowStore((s) => s.renameNode);
  const deleteNode = useFlowStore((s) => s.deleteNode);

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

  const meta = NODE_METAS[node.data.kind];
  const cfg = node.data.config;
  const primary = PRIMARY_FIELD[node.data.kind];

  // 可用变量：其它节点
  const vars = nodes
    .filter((n) => n.id !== selectedId)
    .map((n) => ({ id: n.id, field: VAR_FIELD[n.data.kind] }));

  const insertVar = (id: string, field: string) => {
    const cur = (cfg as unknown as Record<string, unknown>)[primary];
    const text = typeof cur === 'string' ? cur : '';
    const token = `{{${id}.${field}}}`;
    updateNodeConfig(selectedId, { [primary]: text + (text && !text.endsWith(' ') ? ' ' : '') + token } as unknown as Partial<FlowNodeData['config']>);
  };

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
            aria-label="节点名称"
          />
          <button className="btn btn--icon btn--danger" onClick={() => deleteNode(selectedId)} title="删除节点">
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="inspector__body">
        {/* 可用变量 */}
        {vars.length > 0 && (
          <div className="field">
            <span className="field__label">可用变量</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {vars.map((v) => (
                <button key={v.id} className="varhint" onClick={() => insertVar(v.id, v.field)} title="点击插入到主文本">
                  {`{{${v.id}.${v.field}}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <ConfigForm kind={node.data.kind} cfg={cfg} onChange={(patch) => updateNodeConfig(selectedId, patch)} />

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

function ConfigForm({
  kind,
  cfg,
  onChange,
}: {
  kind: NodeKind;
  cfg: FlowNodeData['config'];
  onChange: (patch: Partial<FlowNodeData['config']>) => void;
}) {
  switch (kind) {
    case 'start': {
      const c = cfg as StartConfig;
      return (
        <Field label="用户输入文本" hint="下游用 {{节点ID.text}} 引用">
          <textarea className="textarea" value={c.text} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
      );
    }
    case 'llm': {
      const c = cfg as LLMConfig;
      return (
        <>
          <Field label="模型" hint="留空则用默认模型">
            <input className="input input--mono" value={c.model} placeholder="如 gpt-4o-mini" onChange={(e) => onChange({ model: e.target.value })} />
          </Field>
          <Field label="System Prompt">
            <textarea className="textarea" value={c.system} onChange={(e) => onChange({ system: e.target.value })} />
          </Field>
          <Field label="User Prompt" hint="支持 {{变量}}">
            <textarea className="textarea" value={c.prompt} onChange={(e) => onChange({ prompt: e.target.value })} />
          </Field>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="温度">
              <input className="input" type="number" step="0.1" min="0" max="2" value={c.temperature} onChange={(e) => onChange({ temperature: Number(e.target.value) })} />
            </Field>
            <Field label="最大 Token">
              <input className="input" type="number" step="1" min="1" value={c.maxTokens} onChange={(e) => onChange({ maxTokens: Number(e.target.value) })} />
            </Field>
          </div>
        </>
      );
    }
    case 'tool': {
      const c = cfg as ToolConfig;
      return (
        <>
          <Field label="方法">
            <select className="select" value={c.method} onChange={(e) => onChange({ method: e.target.value as ToolConfig['method'] })}>
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
            </select>
          </Field>
          <Field label="URL" hint="支持 {{变量}}">
            <input className="input input--mono" value={c.url} onChange={(e) => onChange({ url: e.target.value })} />
          </Field>
          <Field label="请求头" hint="每行 Key: Value">
            <textarea className="textarea" value={c.headers} placeholder="Authorization: Bearer xxx" onChange={(e) => onChange({ headers: e.target.value })} />
          </Field>
          <Field label="请求体 (JSON)" hint="支持 {{变量}}">
            <textarea className="textarea" value={c.body} onChange={(e) => onChange({ body: e.target.value })} />
          </Field>
        </>
      );
    }
    case 'condition': {
      const c = cfg as ConditionConfig;
      return (
        <Field label="条件表达式" hint="JS 布尔表达式；true 走右侧分支，false 走下侧分支">
          <textarea className="textarea" value={c.expression} onChange={(e) => onChange({ expression: e.target.value })} />
        </Field>
      );
    }
    case 'code': {
      const c = cfg as CodeConfig;
      return (
        <Field label="代码表达式" hint="形如 return ... ；上游结果在变量 input 上">
          <textarea className="textarea" value={c.expression} onChange={(e) => onChange({ expression: e.target.value })} />
        </Field>
      );
    }
    case 'output': {
      const c = cfg as OutputConfig;
      return (
        <Field label="输出模板" hint="用 {{变量}} 拼最终文本">
          <textarea className="textarea" value={c.template} onChange={(e) => onChange({ template: e.target.value })} />
        </Field>
      );
    }
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span className="field__label">
        {label}
        {hint && <span className="field__hint">{hint}</span>}
      </span>
      {children}
    </div>
  );
}
