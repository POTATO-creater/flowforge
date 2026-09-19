// ============================================================
// 全局类型定义
// ============================================================

export type NodeKind = 'start' | 'llm' | 'tool' | 'condition' | 'code' | 'output';

export type RunStatus = 'idle' | 'running' | 'success' | 'error';

/** 每个节点运行时回写的执行信息 */
export interface RunInfo {
  status: RunStatus;
  /** 节点实际收到的输入（变量解析后） */
  input?: unknown;
  /** 节点产出的结果，下游可通过 {{nodeId.field}} 引用 */
  output?: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
  /** 执行耗时（ms） */
  durationMs?: number;
}

// —— 各节点配置字段 ——

export interface StartConfig {
  text: string; // 用户输入文本，下游引用为 {{start.text}}
}

export interface LLMConfig {
  model: string;
  system: string;
  prompt: string; // 支持 {{变量}}
  temperature: number;
  maxTokens: number;
}

export interface ToolConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string; // 支持 {{变量}}
  headers: string; // 每行 "Key: Value"
  body: string; // JSON 字符串，支持 {{变量}}
}

export interface ConditionConfig {
  expression: string; // JS 布尔表达式，可引用变量；true→"true" 分支
}

export interface CodeConfig {
  expression: string; // 形如 return ... ；输入在变量 input 上
}

export interface OutputConfig {
  template: string; // 用 {{变量}} 拼最终展示文本
}

export type NodeConfig =
  | StartConfig
  | LLMConfig
  | ToolConfig
  | ConditionConfig
  | CodeConfig
  | OutputConfig;

/** 挂在 React Flow node.data 上的数据 */
export interface FlowNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  config: NodeConfig;
  run?: RunInfo;
}

/** 导入 / 导出的工作流文件结构 */
export interface WorkflowJSON {
  version: 1;
  name: string;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
}

export interface SerializedNode {
  id: string;
  kind: NodeKind;
  label: string;
  position: { x: number; y: number };
  config: NodeConfig;
}

export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** API 设置 */
export interface ApiSettings {
  baseURL: string;
  apiKey: string;
  model: string;
}

/** 节点元信息（用于 Sidebar / 工厂） */
export interface NodeMeta {
  kind: NodeKind;
  name: string;
  desc: string;
  badge: string; // 节点库小徽标文字
  colorVar: string; // CSS 变量名
  defaultConfig: () => NodeConfig;
}
