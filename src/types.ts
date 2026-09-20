// ============================================================
// 全局类型定义
// ============================================================

export type NodeKind =
  | 'start'
  | 'llm'
  | 'chain'
  | 'tool'
  | 'fetch'
  | 'agent'
  | 'condition'
  | 'merge'
  | 'loop'
  | 'code'
  | 'output';

export type RunStatus = 'idle' | 'running' | 'success' | 'error';

/** 界面模式：basic = 小白模式（只留核心字段），pro = 大佬模式（全部可见） */
export type AppMode = 'basic' | 'pro';

/** 配置字段的难度分级 */
export type FieldLevel = 'basic' | 'advanced';

/** 每个节点运行时回写的执行信息 */
export interface RunInfo {
  status: RunStatus;
  /** 节点实际收到的输入（变量解析后） */
  input?: unknown;
  /** 节点产出的结果，下游可通过 {{节点名.结果名}} 引用 */
  output?: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
  /** 执行耗时（ms） */
  durationMs?: number;
}

// —— 各节点配置字段 ——

export interface StartConfig {
  text: string; // 用户输入文本
}

export interface LLMConfig {
  model: string;
  system: string;
  prompt: string; // 支持 {{变量}}
  temperature: number;
  maxTokens: number;
}

/** 思维链 / 分步推理 */
export interface ChainConfig {
  question: string; // 支持 {{变量}}
  steps: number; // 期望的思考步数（写入引导语）
  guide: string; // 思考引导语
  model: string;
}

/** 网页抓取（经只读文本代理，绕开浏览器 CORS） */
export interface FetchConfig {
  url: string; // 支持 {{变量}}
  extract: 'markdown' | 'text' | 'raw';
  proxy: string; // 代理前缀模板，默认 https://r.jina.ai/
  headers: string; // 每行 "Key: Value"
  timeout: number; // 秒
}

export interface ToolConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string; // 支持 {{变量}}
  headers: string; // 每行 "Key: Value"
  body: string; // JSON 字符串，支持 {{变量}}
}

/** 工具调用（function calling） */
export interface AgentConfig {
  prompt: string; // 用户问题，支持 {{变量}}
  system: string;
  tools: string; // 工具定义 JSON
  maxRounds: number; // 最多几轮工具调用
  model: string;
}

export interface ConditionConfig {
  expression: string; // 判断表达式，可引用变量；成立→"true" 分支
}

/** 合并 / 聚合（把多个上游汇合成一份） */
export interface MergeConfig {
  mode: 'concat' | 'template' | 'json' | 'first' | 'last';
  separator: string; // concat 模式的分隔符
  template: string; // template 模式：用 {{节点名.结果名}} 引用
}

/** 循环 / 批量处理（节点内部对数组逐项执行） */
export interface LoopConfig {
  source: string; // 待处理的文本，支持 {{变量}}
  separator: string; // 切分分隔符，如 \n 或 ---
  itemPrompt: string; // 单项提示词，用 {{item}} 引用当前项
  system: string;
  maxItems: number; // 上限，防止误烧额度
  model: string;
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
  | ChainConfig
  | ToolConfig
  | FetchConfig
  | AgentConfig
  | ConditionConfig
  | MergeConfig
  | LoopConfig
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
  description?: string;
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
  /** 节点库里展示的人话说明 */
  plain: string;
  badge: string; // 节点库小徽标文字
  colorVar: string; // CSS 变量名
  /** 节点库分组，便于在侧栏分区 */
  group: 'input' | 'ai' | 'action' | 'flow' | 'output';
  defaultConfig: () => NodeConfig;
}

// ============================================================
// 技能（提示词包）
// ============================================================

export interface Skill {
  id: string;
  name: string;
  desc: string;
  /** 技能正文，应用后注入节点里「给 AI 的长期要求」那一栏 */
  prompt: string;
  tags?: string[];
  /** 内置技能不可删除 */
  builtin?: boolean;
}

// ============================================================
// 字段描述（驱动 Inspector 通用渲染 + 模式分级）
// ============================================================

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'code' | 'slider';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  /** 对应 Config 上的键 */
  key: string;
  label: string;
  type: FieldType;
  level: FieldLevel;
  placeholder?: string;
  hint?: string;
  /** select 用 */
  options?: FieldOption[];
  /** number / slider 用 */
  min?: number;
  max?: number;
  step?: number;
  /** slider 用：两端的白话说明，如 ['老老实实的', '天马行空的'] */
  ends?: [string, string];
  /** 是否为主文本字段（用于变量快捷插入） */
  primary?: boolean;
  /** 该字段是否可插入上游变量（默认 text/textarea/code 为 true） */
  vars?: boolean;
}

export interface NodeFieldSpec {
  /** 该节点的全部字段描述 */
  fields: FieldDef[];
  /** 节点面板顶部的一句话说明 */
  plain: string;
  /** 是否支持「套用一个技能」（含长期要求的节点） */
  skillTarget?: boolean;
  /** 技能注入的目标字段，默认 system */
  skillField?: string;
  /** 该节点产出对外暴露的「中文结果名」，用于 {{节点名.结果名}} */
  resultName?: string;
}
