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
import type { FlowNodeData,
  NodeConfig,
  NodeKind,
  RunInfo,
  ApiSettings,
  AppMode,
  ThemeMode,
  ResolvedTheme,
  Skill,
  WorkflowJSON,
  VaultSettings,
  VaultItem,
} from '../types';
import { NODE_METAS } from '../nodeMeta';
import { NODE_FIELDS, VAR_FIELD, primaryFieldOf } from '../fieldDefs';
import { BUILTIN_SKILLS } from '../presets/skills';
import { DEFAULT_PROXY } from '../lib/net';
import { listVaultItems, upsertVaultItem, deleteVaultItem } from '../lib/vault';
import { BUILTIN_AI, BUILTIN_VAULT } from '../lib/builtinCredentials';

const SETTINGS_KEY = 'flowforge.settings';
const WORKFLOW_KEY = 'flowforge.workflow';
const MODE_KEY = 'flowforge.mode';
const THEME_KEY = 'flowforge.theme';
const SKILLS_KEY = 'flowforge.skills';
const MOCK_KEY = 'flowforge.mockMode';
const VERSIONS_KEY = 'flowforge.versions';
const VAULT_KEY = 'flowforge.vault';

/**
 * 保管箱配置。
 *
 * 默认直接采用内置的那一份 —— 也就是「打开就能用，不用填任何东西」。
 * 之所以还留一个本机覆盖的口子，是为了开发者自己要指向别的库时方便；
 * 对普通用户来说，界面上根本不出现这项，也就不会用到。
 */
const DEFAULT_VAULT: VaultSettings = { ...BUILTIN_VAULT };

/** 默认设置。默认指向内置的免费 AI，打开就能跑，不需要任何人填东西。 */
const DEFAULT_SETTINGS: ApiSettings = {
  baseURL: BUILTIN_AI.baseURL,
  apiKey: BUILTIN_AI.apiKey,
  model: BUILTIN_AI.model,
  proxyURL: DEFAULT_PROXY,
};

function loadSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<ApiSettings>;
      // 与默认值合并：老版本存的设置里没有 proxyURL，不能让它变成 undefined。
      // 另外，老版本可能把「地址」留空或指向别处，这里不让空值把内置的免费 AI 顶掉。
      // 密钥同理：以前版本默认密钥是空的，老用户浏览器里就存着一把空钥匙，
      // 不兜底的话内置的免费 AI 会一直被它顶掉，界面就一直说「还没接上」。
      const merged = { ...DEFAULT_SETTINGS, ...saved };
      if (!merged.baseURL) merged.baseURL = DEFAULT_SETTINGS.baseURL;
      if (!merged.model) merged.model = DEFAULT_SETTINGS.model;
      if (!merged.apiKey) merged.apiKey = DEFAULT_SETTINGS.apiKey;
      return merged;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

/**
 * 读取保管箱配置。
 *
 * 注意：地址和钥匙都存在本机浏览器里，不走云端。
 * 之所以这样，是因为「要访问保管箱就得先有钥匙」——把钥匙也放云端等于绕圈子。
 * 保管箱负责的是「那批真正要用的密钥集中在一处」，不是「连保管箱钥匙都藏起来」。
 */
function loadVaultSettings(): VaultSettings {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<VaultSettings>;
      return { ...DEFAULT_VAULT, ...saved };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_VAULT;
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

/**
 * 读取用户选的主题偏好。
 * 缺省是跟随系统——多数人希望界面跟着自己的系统外观走。
 */
function loadTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* ignore */
  }
  return 'system';
}

/** 把「跟随系统」解析成实际生效的亮/暗 */
function resolveTheme(m: ThemeMode): ResolvedTheme {
  if (m === 'system') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }
  return m;
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

function loadMockMode(): boolean {
  try {
    return localStorage.getItem(MOCK_KEY) === '1';
  } catch {
    return false;
  }
}

function loadVersions(): VersionSnapshot[] {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY);
    if (raw) return JSON.parse(raw) as VersionSnapshot[];
  } catch {
    /* 读不出来就当没有 */
  }
  return [];
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
  /** 用户选的主题偏好（light/dark/system），纯界面偏好，不进工作流导出 */
  theme: ThemeMode;
  /** 实际生效的主题（system 已解析），挂到 <html data-theme> 上驱动 CSS */
  resolvedTheme: ResolvedTheme;
  skills: Skill[];

  // —— 深度功能（梯队五）——
  /** 假数据模式：开启后不调真实接口，直接返回构造好的结果，方便先把流程跑通 */
  mockMode: boolean;
  setMockMode: (v: boolean) => void;
  /** 正在从某个连接点拖线时，记下起点，用来高亮能连的节点 */
  connecting: { nodeId: string; handleType: 'source' | 'target' } | null;
  setConnecting: (c: { nodeId: string; handleType: 'source' | 'target' } | null) => void;
  toggleBreakpoint: (id: string) => void;
  /** 版本历史：手动存下的检查点 */
  versions: VersionSnapshot[];
  saveVersion: (name?: string) => void;
  restoreVersion: (id: string) => void;
  deleteVersion: (id: string) => void;

  // —— 画布操作 ——
  onNodesChange: (c: NodeChange[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  deleteEdge: (id: string) => void;
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
  setTheme: (t: ThemeMode) => void;
  /** 系统外观变化时调用；仅在「跟随系统」下才真的改动 */
  applySystemTheme: () => void;

  // —— 云端保管箱 ——
  /** 保管箱的连接信息（地址 + 钥匙），只存在本机 */
  vault: VaultSettings;
  /** 保管箱里已取回的信息；未连接时为空数组 */
  vaultItems: VaultItem[];
  /** 保管箱当前状态，用于界面提示 */
  vaultStatus: VaultStatus;
  /** 记住保管箱的地址与钥匙 */
  saveVaultSettings: (v: VaultSettings) => void;
  /** 从云端把信息取回来 */
  loadVault: () => Promise<void>;
  /** 存一条到云端（有 id 就是改） */
  saveVaultItem: (item: VaultItem) => Promise<void>;
  /** 从云端删掉一条 */
  removeVaultItem: (id: string) => Promise<void>;
  /** 把保管箱里某条 AI 配置套用为当前使用的设置 */
  applyVaultItem: (item: VaultItem) => void;
  /** 开机静默同步：把云端那份 AI 配置取回来用上，取不到就用内置的 */
  syncBuiltinAI: () => Promise<void>;

  // —— 技能 ——
  addSkill: (s: Omit<Skill, 'id'> & { id?: string }) => Skill;
  removeSkill: (id: string) => void;
  applySkill: (nodeId: string, skillId: string, field: string, append: boolean) => void;

  // —— 持久化 / 导入导出 ——
  serialize: () => WorkflowJSON;
  loadWorkflowJSON: (wf: WorkflowJSON, name?: string) => void;
  persist: () => void;

  // —— 撤销 / 重做 ——
  past: Snapshot[];
  future: Snapshot[];
  _pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

/** 历史快照：只存节点与连线（运行态是临时的，不进历史） */
interface Snapshot {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
}

/** 版本检查点：把整张工作流（含名字）存成一个可恢复的状态 */
export interface VersionSnapshot {
  id: string;
  name: string;
  time: number;
  workflowName: string;
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
}

const HISTORY_LIMIT = 80;
/** 文本类编辑做短时间合并，避免一次打字产生几十个撤销点 */
let editCoalesce: { key: string; t: number } | null = null;

/** 保管箱的连接状态，驱动界面上的提示文字 */
export type VaultStatus =
  | { state: 'off' } // 没配，或没去连
  | { state: 'connecting' }
  | { state: 'ok'; note: string }
  | { state: 'error'; note: string };

const initial = loadWorkflow();

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: initial?.nodes ?? [],
  edges: initial?.edges ?? [],
  selectedId: null,
  running: false,
  settings: loadSettings(),
  workflowName: '未命名工作流',
  mode: loadMode(),
  theme: loadTheme(),
  resolvedTheme: resolveTheme(loadTheme()),
  skills: loadSkills(),
  mockMode: loadMockMode(),
  connecting: null,
  versions: loadVersions(),
  vault: loadVaultSettings(),
  vaultItems: [],
  vaultStatus: { state: 'off' },

  past: [],
  future: [],

  onNodesChange: (c) => {
    // 拖拽开始时记一次（此时还是旧位置），松手不再重复记
    const startDrag = c.some((ch) => ch.type === 'position' && ch.dragging === true);
    const structural = c.some((ch) => ch.type === 'remove' || ch.type === 'add');
    if (startDrag || structural) get()._pushHistory();
    set({ nodes: applyNodeChanges(c, get().nodes) as Node<FlowNodeData>[] });
    if (structural) get().persist();
    // 拖完落点后把最终坐标写进本地
    if (c.some((ch) => ch.type === 'position' && ch.dragging === false)) get().persist();
  },
  onEdgesChange: (c) => {
    const structural = c.some((ch) => ch.type === 'remove' || ch.type === 'add');
    if (structural) get()._pushHistory();
    set({ edges: applyEdgeChanges(c, get().edges) });
    if (structural) get().persist();
  },
  onConnect: (c) => {
    get()._pushHistory();
    const nextEdges = addEdge(
      { ...c, id: `e_${c.source}_${c.target}_${c.sourceHandle ?? 'o'}` },
      get().edges,
    );
    set({ edges: nextEdges });
    // 刚连上就把上游结果自动填进目标节点的主输入框（仅当它是空的）
    autofillFromUpstream(c.target);
    get().persist();
  },

  deleteEdge: (id) => {
    get()._pushHistory();
    set({ edges: get().edges.filter((e) => e.id !== id) });
    get().persist();
  },

  addNodeAt: (kind, position) => {
    get()._pushHistory();
    const meta = NODE_METAS[kind];
    const id = `${kind}_${Math.random().toString(36).slice(2, 8)}`;
    const node: Node<FlowNodeData> = {
      id,
      type: 'flow',
      position,
      data: { kind, label: uniqueLabel(meta.name, get().nodes), config: meta.defaultConfig() },
    };
    set({ nodes: [...get().nodes, node], selectedId: id });
    get().persist();
  },

  setSelected: (id) => set({ selectedId: id }),

  updateNodeConfig: (id, patch) => {
    const now = Date.now();
    const key = `cfg:${id}:${Object.keys(patch).join(',')}`;
    // 同一个输入框的连续输入合并成一个撤销点（700ms 内）
    const canCoalesce = editCoalesce?.key === key && now - editCoalesce.t < 700;
    if (!canCoalesce) get()._pushHistory();
    editCoalesce = { key, t: now };
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } as NodeConfig } } : n,
      ),
    });
    get().persist();
  },

  renameNode: (id, label) => {
    const now = Date.now();
    const key = `rename:${id}`;
    const canCoalesce = editCoalesce?.key === key && now - editCoalesce.t < 700;
    if (!canCoalesce) get()._pushHistory();
    editCoalesce = { key, t: now };
    const prev = get().nodes.find((n) => n.id === id)?.data.label;
    const next = label;

    set({
      nodes: get().nodes.map((n) => {
        if (n.id === id) return { ...n, data: { ...n.data, label: next } };
        // 节点改名后，其它节点里 {{旧名.结果名}} 的引用要跟着改，
        // 否则引用会失效。这是中文变量名方案的必要配套。
        if (prev && prev !== next) {
          return { ...n, data: { ...n.data, config: renameRefs(n.data.config, prev, next) } };
        }
        return n;
      }),
    });
    get().persist();
  },

  deleteNode: (id) => {
    get()._pushHistory();
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: get().selectedId === id ? null : get().selectedId,
    });
    get().persist();
  },

  clear: () => {
    if (get().nodes.length === 0 && get().edges.length === 0) return;
    get()._pushHistory();
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

  // —— 云端保管箱 ——

  saveVaultSettings: (v) => {
    try {
      localStorage.setItem(VAULT_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
    // 换了地址或钥匙，之前取回的内容就作废了，免得张冠李戴
    set({ vault: v, vaultItems: [], vaultStatus: { state: 'off' } });
  },

  loadVault: async () => {
    const { vault } = get();
    if (!vault.url.trim() || !vault.key.trim()) {
      // 没填就直说。这里不能悄悄返回 —— 用户点了「测试连接」却毫无反应最让人困惑。
      set({
        vaultItems: [],
        vaultStatus: {
          state: 'error',
          note: '还没填全。保管箱地址和开启保管箱的钥匙，两个都要填上。',
        },
      });
      return;
    }
    set({ vaultStatus: { state: 'connecting' } });
    try {
      const items = await listVaultItems(vault);
      set({
        vaultItems: items,
        vaultStatus: {
          state: 'ok',
          note: items.length ? `已从云端取回 ${items.length} 条` : '连上了，云端还是空的',
        },
      });
    } catch (e) {
      set({
        vaultItems: [],
        vaultStatus: { state: 'error', note: e instanceof Error ? e.message : String(e) },
      });
    }
  },

  saveVaultItem: async (item) => {
    const { vault } = get();
    const saved = await upsertVaultItem(vault, item);
    const rest = get().vaultItems.filter((it) => it.id !== saved.id && it.name !== saved.name);
    set({ vaultItems: [...rest, saved] });
  },

  removeVaultItem: async (id) => {
    const { vault } = get();
    await deleteVaultItem(vault, id);
    set({ vaultItems: get().vaultItems.filter((it) => it.id !== id) });
  },

  applyVaultItem: (item) => {
    if (item.kind !== 'ai_service') return;
    const p = item.payload as Partial<ApiSettings>;
    const next: ApiSettings = {
      ...get().settings,
      baseURL: typeof p.baseURL === 'string' ? p.baseURL : get().settings.baseURL,
      apiKey: typeof p.apiKey === 'string' ? p.apiKey : get().settings.apiKey,
      model: typeof p.model === 'string' ? p.model : get().settings.model,
      proxyURL: typeof p.proxyURL === 'string' ? p.proxyURL : get().settings.proxyURL,
    };
    get().saveSettings(next);
  },

  /**
   * 开机自动同步：把云端存着的那份 AI 配置取回来用上。
   *
   * 整个流程是「静默」的 —— 界面上不会弹任何东西：
   *   · 取到了，就悄悄换上；用户唯一的感觉是「打开就能用」；
   *   · 取不到（断网、服务临时抽风），就保持内置的那份，照样能用。
   *
   * 之所以要有这一步：内置那份是「及格线」，云端那份才是「随时能改的地方」——
   * 想换模型、换额度，在后台改一下，所有人下次打开就生效，不用重新发版本。
   */
  syncBuiltinAI: async () => {
    const { vault } = get();
    if (!vault.url.trim() || !vault.key.trim()) return;

    let items: VaultItem[];
    try {
      items = await listVaultItems(vault);
    } catch {
      // 连不上就用内置那份，不打扰任何人
      return;
    }
    set({ vaultItems: items, vaultStatus: { state: 'ok', note: '' } });

    // 优先用标了「默认」的那条 AI 配置，没有就取第一条 AI 配置
    const aiItems = items.filter((it) => it.kind === 'ai_service');
    const chosen = aiItems.find((it) => it.is_default) ?? aiItems[0];
    if (!chosen) return;

    const p = chosen.payload as Partial<ApiSettings>;
    // 云端这条里要是缺了钥匙（比如只存了地址），就拿内置的补上，别把能用的状态弄坏
    const next: ApiSettings = {
      baseURL: p.baseURL || get().settings.baseURL || BUILTIN_AI.baseURL,
      apiKey: p.apiKey || get().settings.apiKey || BUILTIN_AI.apiKey,
      model: p.model || get().settings.model || BUILTIN_AI.model,
      proxyURL: typeof p.proxyURL === 'string' ? p.proxyURL : get().settings.proxyURL,
    };
    set({ settings: next });
  },

  setMode: (m) => {
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
    set({ mode: m });
  },

  setTheme: (t) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore */
    }
    set({ theme: t, resolvedTheme: resolveTheme(t) });
  },

  applySystemTheme: () => {
    // 用户没选「跟随系统」时，系统变化不该影响界面
    if (get().theme !== 'system') return;
    set({ resolvedTheme: resolveTheme('system') });
  },

  setMockMode: (v) => {
    try {
      localStorage.setItem(MOCK_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ mockMode: v });
  },

  setConnecting: (c) => set({ connecting: c }),

  toggleBreakpoint: (id) => {
    get()._pushHistory();
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, breakpoint: !n.data.breakpoint } } : n,
      ),
    });
    get().persist();
  },

  saveVersion: (name) => {
    const snap: VersionSnapshot = {
      id: `v_${Date.now().toString(36)}`,
      name: name?.trim() || `存于 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      time: Date.now(),
      workflowName: get().workflowName,
      nodes: get().nodes,
      edges: get().edges,
    };
    const next = [...get().versions, snap].slice(-30);
    try {
      localStorage.setItem(VERSIONS_KEY, JSON.stringify(next));
    } catch {
      /* 存不进去也无所谓 */
    }
    set({ versions: next });
  },

  restoreVersion: (id) => {
    const snap = get().versions.find((v) => v.id === id);
    if (!snap) return;
    get().loadWorkflowJSON(
      {
        version: 1,
        name: snap.workflowName,
        nodes: snap.nodes.map((n) => ({
          id: n.id,
          kind: n.data.kind,
          label: n.data.label,
          position: n.position,
          config: n.data.config,
        })),
        edges: snap.edges,
      },
      snap.workflowName,
    );
  },

  deleteVersion: (id) => {
    const next = get().versions.filter((v) => v.id !== id);
    try {
      localStorage.setItem(VERSIONS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ versions: next });
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
    const now = Date.now();
    const key = `skill:${nodeId}:${field}`;
    const canCoalesce = editCoalesce?.key === key && now - editCoalesce.t < 700;
    if (!canCoalesce) get()._pushHistory();
    editCoalesce = { key, t: now };
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
    get()._pushHistory();
    set({
      workflowName: name || wf.name || '未命名工作流',
      nodes: toFlowNodes(wf.nodes ?? []),
      edges: toFlowEdges(wf.edges ?? []),
      selectedId: null,
    });
    get().persist();
  },

  _pushHistory: () => {
    set((s) => ({
      past: [...s.past, { nodes: s.nodes, edges: s.edges }].slice(-HISTORY_LIMIT),
      future: [],
    }));
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      past: past.slice(0, -1),
      future: [{ nodes, edges }, ...future].slice(0, HISTORY_LIMIT),
    });
    editCoalesce = null;
    get().persist();
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      nodes: next.nodes,
      edges: next.edges,
      past: [...past, { nodes, edges }].slice(-HISTORY_LIMIT),
      future: future.slice(1),
    });
    editCoalesce = null;
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

// ============================================================
// 节点改名时，同步更新其它节点里对它的中文引用 {{旧名.结果名}}
// ============================================================
function renameRefs(config: NodeConfig, from: string, to: string): NodeConfig {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 匹配 {{旧名}} 与 {{旧名.结果名}}
  const re = new RegExp(`\\{\\{\\s*${esc(from)}(?=\\s*[.}])`, 'g');
  const out: Record<string, unknown> = { ...(config as unknown as Record<string, unknown>) };
  let changed = false;
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== 'string' || !v.includes('{{')) continue;
    const nextV = v.replace(re, `{{${to}`);
    if (nextV !== v) {
      out[k] = nextV;
      changed = true;
    }
  }
  return (changed ? out : config) as unknown as NodeConfig;
}

// ============================================================
// 节点名去重：同名节点会导致中文引用歧义，自动加序号
// ============================================================
function uniqueLabel(base: string, nodes: Node<FlowNodeData>[]): string {
  const used = new Set(nodes.map((n) => n.data.label));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

// ============================================================
// 刚连上上游时，自动把上游结果填进目标节点的主输入框
// （仅当该框为空，避免覆盖用户已经写好的内容）
// ============================================================
function autofillFromUpstream(targetId: string) {
  const store = useFlowStore.getState();
  const target = store.nodes.find((n) => n.id === targetId);
  if (!target) return;

  const primaryKey = primaryFieldOf(target.data.kind);
  const cfg = target.data.config as unknown as Record<string, unknown>;
  const cur = cfg[primaryKey];
  if (typeof cur === 'string' && cur.trim() !== '') return;

  // 取第一个上游
  const edge = store.edges.find((e) => e.target === targetId);
  if (!edge) return;
  const src = store.nodes.find((n) => n.id === edge.source);
  if (!src) return;

  const resultName = NODE_FIELDS[src.data.kind].resultName ?? VAR_FIELD[src.data.kind];
  const token = `{{${src.data.label}.${resultName}}}`;

  useFlowStore.setState({
    nodes: store.nodes.map((n) =>
      n.id === targetId
        ? {
            ...n,
            data: {
              ...n.data,
              config: { ...n.data.config, [primaryKey]: token } as NodeConfig,
            },
          }
        : n,
    ),
  });
}
