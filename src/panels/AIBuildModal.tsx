import { useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import { NODE_METAS } from '../nodeMeta';
import { normalizeConfig } from '../store/flowStore';
import { callLLM } from '../engine/llm';
import type { NodeKind, WorkflowJSON } from '../types';

const SYSTEM = `你是一个工作流搭建助手。用户用大白话描述想做什么，你把它拆成一系列节点，并用 JSON 返回。
只准使用下面这些节点种类（kind）：
${Object.entries(NODE_METAS)
  .map(([k, m]) => `${k}（${m.name}）`)
  .join('、')}

严格按如下 JSON 格式返回，不要任何解释、不要 markdown 代码块：
{"nodes":[{"kind":"<种类>","label":"<中文名字>","config":{<该节点的配置，能省的留空字符串>}}],"edges":[{"from":0,"to":1}]}
其中 edges 的 from/to 是 nodes 数组里的下标（从 0 开始）。第一个节点通常是 start。config 里只写必要字段，缺的留空字符串或默认值。`;

export function AIBuildModal({ onClose }: { onClose: () => void }) {
  const settings = useFlowStore((s) => s.settings);
  const loadWorkflowJSON = useFlowStore((s) => s.loadWorkflowJSON);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const build = async () => {
    if (!settings.apiKey) {
      setErr('自带的免费 AI 没接上（多半是网络问题）。检查一下网络，或者从设置里换成自己的 AI。');
      return;
    }
    if (!desc.trim()) {
      setErr('先说说你想搭个什么流程。');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await callLLM(
        settings,
        { model: settings.model, system: SYSTEM, prompt: desc, temperature: 0.4, maxTokens: 1500 },
        new AbortController().signal,
      );
      const parsed = parseJSON(r.content);
      if (!parsed || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
        throw new Error('AI 返回的内容没法解析成工作流。');
      }
      const validKinds = new Set(Object.keys(NODE_METAS));
      const nodes = (parsed.nodes as Array<{ kind: string; label?: string; config?: Record<string, unknown> }>).map(
        (n, i) => {
        if (!validKinds.has(n.kind)) throw new Error(`AI 用了一个不存在的节点类型：${n.kind}`);
        return {
          id: `n${i}`,
          kind: n.kind as NodeKind,
          label: n.label || NODE_METAS[n.kind as NodeKind].name,
          position: { x: 80 + (i % 4) * 280, y: 80 + Math.floor(i / 4) * 170 },
          config: normalizeConfig(n.kind as NodeKind, n.config ?? {}),
        };
      });
      const edges = ((parsed.edges ?? []) as Array<{ from: number; to: number }>)
        .filter((e) => Number.isInteger(e.from) && Number.isInteger(e.to))
        .map((e, i) => ({
          id: `e${i}`,
          source: `n${e.from}`,
          target: `n${e.to}`,
          sourceHandle: 'out',
          targetHandle: null,
        }));
      const wf: WorkflowJSON = { version: 1, name: `AI 搭的：${desc.slice(0, 16)}`, nodes, edges };
      loadWorkflowJSON(wf, wf.name);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          用 AI 搭流程
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal__body">
          <p className="inspector__plain">用大白话描述你想做什么，AI 会帮你拆成一串节点并自动连好。</p>
          <textarea
            className="textarea"
            style={{ minHeight: 110 }}
            placeholder="例如：从技术热榜抓 10 条，让 AI 每一条都写一句中文摘要，最后汇总成一篇文章。"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          {err && <p className="logs__detail-err">{err}</p>}
        </div>
        <div className="modal__foot">
          <button className="btn" onClick={onClose}>
            关掉
          </button>
          <button className="btn btn--primary" onClick={build} disabled={busy}>
            {busy ? 'AI 正在搭…' : '让 AI 搭'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 尽量从模型输出里抠出 JSON（兼容带 ```json 围栏的情况） */
function parseJSON(text: string): { nodes: unknown[]; edges?: unknown[] } | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
