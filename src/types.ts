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
  | 'output'
  // —— 数据整理（纯函数，不联网）——
  | 'pick' // 挑出想要的
  | 'filter' // 分拣
  | 'sort' // 排序
  | 'limit' // 只要前几条
  | 'dedupe' // 去掉重复
  | 'splitout' // 分成多条
  | 'aggregate' // 聚成一组
  | 'summarize' // 算一算
  | 'renamekeys' // 改字段名
  // —— 文字处理 ——
  | 'markdown' // 转换排版
  | 'html' // 摆弄网页标签
  | 'xml' // 处理数据格式
  | 'findreplace' // 查找替换
  | 'slice' // 切一段出来
  // —— 日期与编码 ——
  | 'datetime' // 日期时间
  | 'crypto' // 加密哈希
  | 'encode' // 编码转换
  | 'totp' // 生成动态口令
  | 'jwt' // 看令牌
  // —— 网络类（走跨域治理层）——
  | 'hn' // 看技术热榜
  | 'rss' // 读订阅
  | 'chart' // 出图表
  | 'fact' // 查冷知识
  // —— 流程控制补充 ——
  | 'wait' // 等一会儿
  | 'switch' // 分多条路
  | 'stop' // 出错就停
  // —— 看结果 ——
  | 'watch'; // 显示面板：连到任意节点上，专门看它的某一项

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

// ============================================================
// 数据整理类配置（对应 n8n 的 Fire 类核心节点）
// ============================================================

/** 挑出想要的：从上游结果里挑出指定字段 */
export interface PickConfig {
  fields: string; // 要保留的字段，逗号分隔
  missing: 'empty' | 'skip'; // 上游没有这个字段时怎么办
}

/** 分拣：按关键词筛条目 */
export interface FilterConfig {
  keyword: string;
  mode: 'contains' | 'notContains' | 'startsWith' | 'endsWith';
}

/** 排序 */
export interface SortConfig {
  by: 'text' | 'length' | 'number';
  order: 'asc' | 'desc';
}

/** 只要前几条 */
export interface LimitConfig {
  count: number;
  from: 'head' | 'tail';
}

/** 去掉重复：无配置项，保留空对象结构以便将来扩展 */
export interface DedupeConfig {
  ignoreCase: boolean;
}

/** 分成多条 */
export interface SplitOutConfig {
  separator: string; // 为空则按换行
}

/** 聚成一组 */
export interface AggregateConfig {
  separator: string;
}

/** 算一算 */
export interface SummarizeConfig {
  op: 'count' | 'sum' | 'average' | 'max' | 'min' | 'join' | 'unique';
  separator: string;
}

/** 改字段名 */
export interface RenameKeysConfig {
  mapping: string; // 每行「旧字段=新字段」
}

// ============================================================
// 文字处理类配置
// ============================================================

/** 转换排版：Markdown ↔ HTML */
export interface MarkdownConfig {
  text: string; // 支持 {{变量}}
  direction: 'md2html' | 'html2md';
}

/** 摆弄网页标签 */
export interface HtmlConfig {
  text: string;
  op: 'toText' | 'extract';
  selector: string; // extract 模式：要提取什么标签
  attr: string; // extract 模式：取标签的哪个属性，为空则取文字
}

/** 处理数据格式：XML ↔ 对象 */
export interface XmlConfig {
  text: string;
  direction: 'xml2obj' | 'obj2xml';
}

/** 查找替换 */
export interface FindReplaceConfig {
  text: string;
  find: string;
  replace: string;
  regex: boolean;
  all: boolean;
  ignoreCase: boolean;
}

/** 切一段出来 */
export interface SliceConfig {
  text: string;
  bySeparator: boolean;
  separator: string;
  index: number;
  from: number;
  to: number;
}

// ============================================================
// 日期与编码类配置
// ============================================================

/** 日期时间 */
export interface DateTimeConfig {
  source: string; // 支持 {{变量}}；op 为 now 时可留空
  op: 'now' | 'format' | 'add' | 'diff' | 'weekday';
  format: string;
  amount: number;
  unit: 'day' | 'hour' | 'minute' | 'month' | 'year';
  target: string;
}

/** 加密哈希 */
export interface CryptoConfig {
  text: string;
  op: 'hash' | 'hmac' | 'random';
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
  secret: string; // hmac 用
  length: number; // random 用
  randomKind: 'alnum' | 'hex' | 'number';
}

/** 编码转换 */
export interface EncodeConfig {
  text: string;
  op: 'b64enc' | 'b64dec' | 'urlenc' | 'urldec' | 'htmlenc' | 'htmldec';
}

/** 生成动态口令 */
export interface TotpConfig {
  secret: string;
  digits: number;
  period: number;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
}

/** 看令牌 */
export interface JwtConfig {
  token: string;
  op: 'decode' | 'sign';
  secret: string;
  payload: string;
}

// ============================================================
// 网络类配置（全部走跨域治理层）
// ============================================================

/** 看技术热榜（Hacker News） */
export interface HnConfig {
  source: string; // hn-top / hn-new
  count: number; // 取几条
}

/** 读订阅（RSS / Atom） */
export interface RssConfig {
  url: string;
  count: number;
}

/** 出图表（QuickChart，返回图片地址） */
export interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'doughnut';
  labels: string; // 逗号分隔
  values: string; // 逗号分隔
  title: string;
}

/** 查冷知识 */
export interface FactConfig {
  source: string; // catfact / uselessfacts
}

// ============================================================
// 流程控制补充
// ============================================================

/** 等一会儿 */
export interface WaitConfig {
  seconds: number;
}

/** 分多条路：按关键词把流程导向不同分支 */
export interface SwitchConfig {
  routes: string; // 每行一条，形如「关键词=分支名」
  fallback: 'yes' | 'no'; // 都不匹配时是否走「其它」分支
}

/** 出错就停 */
export interface StopConfig {
  message: string; // 要展示的提示语
  when: 'always' | 'ifEmpty'; // 总是停，还是内容为空时才停
}

/** 显示面板：连到任意一个节点上，专门看它的某一项结果 */
export interface WatchConfig {
  want: string; // 想看的是哪一项（不填就看整体）
  note: string; // 面板上显示的小标题，方便自己认
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
  | OutputConfig
  | PickConfig
  | FilterConfig
  | SortConfig
  | LimitConfig
  | DedupeConfig
  | SplitOutConfig
  | AggregateConfig
  | SummarizeConfig
  | RenameKeysConfig
  | MarkdownConfig
  | HtmlConfig
  | XmlConfig
  | FindReplaceConfig
  | SliceConfig
  | DateTimeConfig
  | CryptoConfig
  | EncodeConfig
  | TotpConfig
  | JwtConfig
  | HnConfig
  | RssConfig
  | ChartConfig
  | FactConfig
  | WaitConfig
  | SwitchConfig
  | StopConfig
  | WatchConfig;

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
  /**
   * 网络中转地址。有些网站不允许网页直接访问（浏览器跨域限制），
   * 填一个中转前缀就能绕过。留空表示「不中转，直接访问」。
   */
  proxyURL: string;
}

/** 节点的功能分组，决定它出现在左侧节点库的哪一栏 */
export type NodeGroup =
  | 'input' // 从哪开始
  | 'ai' // 让 AI 干活
  | 'net' // 去网上取东西
  | 'data' // 数据整理
  | 'text' // 文字处理
  | 'codec' // 日期与编码
  | 'flow' // 控制流程
  | 'output'; // 看结果

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
  group: NodeGroup;
  /** 这个节点是否依赖「网络中转」才能访问某些网站（侧栏会打标提示） */
  needsProxy?: boolean;
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
