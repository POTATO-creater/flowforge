import { create } from 'zustand';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type {
  FlowNodeData,
  NodeConfig,
  NodeKind,
  RunInfo,
  ApiSettings,
  AppMode,
  Skill,
  WorkflowJSON,
} from '../types';
import { NODE_METAS } from '../nodeMeta';
import { BUILTIN_SKILLS } from '../presets/skills';

const SETTINGS_KEY = 'flowforge.settings';
const WORKFLOW_KEY = 'flowforge.workflow';
const MODE_KEY = 'flowforge.mode';
const SKILLS_KEY = 'flowforge.skills';

function loadSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { baseURL: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' };
}

function loadMode(): AppMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === 'basic' || raw === 'pro') return raw;
  } catch {
    /* ignore */
  }
  // 默认小白模式：界面更简洁，贴合"过于复杂"的诉求
  return 'basic';
}

/** 用户导入的技能与内置技能合并（同名以内置为准去重） */
function loadSkills(): Skill[] {
  let mine: Skill[] = [];
  try {
    const raw = localStorage.getItem(SKILLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) mine = parsed as Skill[];
    }
  } catch {
    /* ignore */
  }
  const builtinIds = new Set(BUILTIN_SKILLS.map((s) => s.id));
  return [...BUILTIN_SKILLS, ...mine.filter((s) => !builtinIds.has(s.id))];
}

function toFlowNodes(list: WorkflowJSON['nodes']): Node<FlowNodeData>[] {
  return list.map((n) => ({
    id: n.id,
    type: 'flow',
    position: n.position,
    data: {
      kind: n.kind,
      label: n.label,
      // 补齐缺失字段，保证外部模板也能安全载入
      config: normalizeConfig(n.kind, n.config),
    },
  }));
}

/** 用默认配置兜底未知/缺失字段，容忍外部手写模板 */
export function normalizeConfig(kind: NodeKind, raw: unknown): NodeConfig {
  const base = NODE_METAS[kind]?.defaultConfig() as unknown as Record<string, unknown> | undefined;
  if (!base) return (raw ?? {}) as NodeConfig;
  if (!raw || typeof raw !== 'object') return base as unknown as NodeConfig;
  return { ...base, ...(raw as Record<string, unknown>) } as unknown as NodeConfig;
}

function toFlowEdges(list: WorkflowJSON['edges']): Edge[] {
  return list.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
  }));
}

function loadWorkflow(): { nodes: Node<FlowNodeData>[]; edges: Edge[] } | null {
  try {
    const raw = localStorage.getItem(WORKFLOW_KEY);
    if (!raw) return null;
    const wf = JSON.parse(raw) as WorkflowJSON;
    if (!Array.isArray(wf?.nodes)) return null;
    return { nodes: toFlowNodes(wf.nodes), edges: toFlowEdges(wf.edges ?? []) };
  } catch {
    return null;
  }
}

interface FlowState {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  selectedId: string | null;
  running: boolean;
  settings: ApiSettings;
  workflowName: string;
  mode: AppMode;
  skills: Skill[];

  // —— 画布操作 ——
  onNodesChange: (c: NodeChange[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  addNodeAt: (kind: NodeKind, position: { x: number; y: number }) => void;
  setSelected: (id: string | null) => void;
  updateNodeConfig: (id: string, patch: Partial<NodeConfig>) => void;
  renameNode: (id: string, label: string) => void;
  deleteNode: (id: string) => void;
  clear: () => void;

  // —— 运行态 ——
  setRunning: (v: boolean) => void;
  setNodeRun: (id: string, run: RunInfo | undefined) => void;
  resetRuns: () => void;

  // —— 设置 / 模式 ——
  saveSettings: (s: ApiSettings) => void;
  setMode: (m: AppMode) => void;

  // —— 技能 ——
  addSkill: (s: Omit<Skill, 'id'> & { id?: string }) => Skill;
  removeSkill: (id: string) => void;
  applySkill: (nodeId: string, skillId: string, field: string, append: boolean) => void;

  // —— 持久化 / 导入导出 ——
  serialize: () => WorkflowJSON;
  loadWorkflowJSON: (wf: WorkflowJSON, name?: string) => void;
  persist: () => void;
}

const initial = loadWorkflow();

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: initial?.nodes ?? [],
  edges: initial?.edges ?? [],
  selectedId: null,
  running: false,
  settings: loadSettings(),
  workflowName: '未命名工作流',
  mode: loadMode(),
  skills: loadSkills(),

  onNodesChange: (c) => set({ nodes: applyNodeChanges(c, get().nodes) as Node<FlowNodeData>[] }),
  onEdgesChange: (c) => set({ edges: applyEdgeChanges(c, get().edges) }),
  onConnect: (c) =>
    set({
      edges: addEdge(
        { ...c, id: `e_${c.source}_${c.target}_${c.sourceHandle ?? 'o'}` },
        get().edges,
      ),
    }),

  addNodeAt: (kind, position) => {
    const meta = NODE_METAS[kind];
    const id = `${kind}_${Math.random().toString(36).slice(2, 8)}`;
    const node: Node<FlowNodeData> = {
      id,
      type: 'flow',
      position,
      data: { kind, label: meta.name, config: meta.defaultConfig() },
    };
    set({ nodes: [...get().nodes, node], selectedId: id });
    get().persist();
  },

  setSelected: (id) => set({ selectedId: id }),

  updateNodeConfig: (id, patch) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } as NodeConfig } } : n,
      ),
    });
    get().persist();
  },

  renameNode: (id, label) => {
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
    });
    get().persist();
  },

  deleteNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: get().selectedId === id ? null : get().selectedId,
    });
    get().persist();
  },

  clear: () => {
    set({ nodes: [], edges: [], selectedId: null });
    get().persist();
  },

  setRunning: (v) => set({ running: v }),

  setNodeRun: (id, run) => {
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, run } } : n)),
    });
  },

  resetRuns: () => {
    set({
      nodes: get().nodes.map((n) => (n.data.run ? { ...n, data: { ...n.data, run: undefined } } : n)),
    });
  },

  saveSettings: (s) => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
    set({ settings: s });
  },

  setMode: (m) => {
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
    set({ mode: m });
  },

  addSkill: (input) => {
    const skill: Skill = {
      id: input.id || `skill_${Math.random().toString(36).slice(2, 9)}`,
      name: input.name || '未命名技能',
      desc: input.desc || '',
      prompt: input.prompt || '',
      tags: input.tags ?? [],
      builtin: false,
    };
    const next = [...get().skills.filter((s) => s.id !== skill.id), skill];
    try {
      // 只持久化用户导入的（内置技能由代码维护）
      localStorage.setItem(SKILLS_KEY, JSON.stringify(next.filter((s) => !s.builtin)));
    } catch {
      /* ignore */
    }
    set({ skills: next });
    return skill;
  },

  removeSkill: (id) => {
    const next = get().skills.filter((s) => s.id !== id || s.builtin);
    try {
      localStorage.setItem(SKILLS_KEY, JSON.stringify(next.filter((s) => !s.builtin)));
    } catch {
      /* ignore */
    }
    set({ skills: next });
  },

  applySkill: (nodeId, skillId, field, append) => {
    const skill = get().skills.find((s) => s.id === skillId);
    if (!skill) return;
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const cfg = node.data.config as unknown as Record<string, unknown>;
    const cur = typeof cfg[field] === 'string' ? (cfg[field] as string) : '';
    const next = append && cur.trim() ? `${cur.trim()}\n\n${skill.prompt}` : skill.prompt;
    get().updateNodeConfig(nodeId, { [field]: next } as unknown as Partial<NodeConfig>);
  },

  serialize: () => ({
    version: 1,
    name: get().workflowName,
    nodes: get().nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      label: n.data.label,
      position: n.position,
      config: n.data.config,
    })),
    edges: get().edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    })),
  }),

  loadWorkflowJSON: (wf, name) => {
    set({
      workflowName: name || wf.name || '未命名工作流',
      nodes: toFlowNodes(wf.nodes ?? []),
      edges: toFlowEdges(wf.edges ?? []),
      selectedId: null,
    });
    get().persist();
  },

  persist: () => {
    try {
      localStorage.setItem(WORKFLOW_KEY, JSON.stringify(get().serialize()));
    } catch {
      /* ignore quota */
    }
  },
}));
