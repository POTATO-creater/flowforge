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
import type { FlowNodeData, NodeConfig, RunInfo, ApiSettings, WorkflowJSON } from '../types';
import { NODE_METAS } from '../nodeMeta';

const SETTINGS_KEY = 'flowforge.settings';
const WORKFLOW_KEY = 'flowforge.workflow';

function loadSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { baseURL: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' };
}

function loadWorkflow(): { nodes: Node<FlowNodeData>[]; edges: Edge[] } | null {
  try {
    const raw = localStorage.getItem(WORKFLOW_KEY);
    if (!raw) return null;
    const wf = JSON.parse(raw) as WorkflowJSON;
    return {
      nodes: wf.nodes.map((n) => ({
        id: n.id,
        type: 'flow',
        position: n.position,
        data: { kind: n.kind, label: n.label, config: n.config },
      })),
      edges: wf.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
    };
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

  // —— 画布操作 ——
  onNodesChange: (c: NodeChange[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  addNodeAt: (kind: keyof typeof NODE_METAS, position: { x: number; y: number }) => void;
  setSelected: (id: string | null) => void;
  updateNodeConfig: (id: string, patch: Partial<NodeConfig>) => void;
  renameNode: (id: string, label: string) => void;
  deleteNode: (id: string) => void;
  clear: () => void;

  // —— 运行态 ——
  setRunning: (v: boolean) => void;
  setNodeRun: (id: string, run: RunInfo | undefined) => void;
  resetRuns: () => void;

  // —— 设置 ——
  saveSettings: (s: ApiSettings) => void;

  // —— 持久化 / 导入导出 ——
  serialize: () => WorkflowJSON;
  loadWorkflowJSON: (wf: WorkflowJSON) => void;
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
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, run } } : n,
      ),
    });
  },

  resetRuns: () => {
    set({
      nodes: get().nodes.map((n) =>
        n.data.run ? { ...n, data: { ...n.data, run: undefined } } : n,
      ),
    });
  },

  saveSettings: (s) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    set({ settings: s });
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

  loadWorkflowJSON: (wf) => {
    set({
      workflowName: wf.name || '未命名工作流',
      nodes: wf.nodes.map((n) => ({
        id: n.id,
        type: 'flow',
        position: n.position,
        data: { kind: n.kind, label: n.label, config: n.config },
      })),
      edges: wf.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
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
