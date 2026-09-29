// ============================================================
// 执行引擎的公共类型与常量
// ============================================================
import type { Node, Edge } from '@xyflow/react';
import type { ApiSettings, FlowNodeData } from '../../types';
import type { VarContext } from '../vars';

/** 一条运行日志。tag 决定它在界面上显示成什么颜色 */
export interface LogEntry {
  t: string;
  tag: 'info' | 'run' | 'ok' | 'err';
  msg: string;
}

/** 循环节点的硬上限，防止误配导致 token 燃烧 */
export const LOOP_HARD_CAP = 50;

/**
 * 执行一个节点所需的一整套上下文。
 *
 * 拆成对象传参（而不是一路铺开七八个参数），是为了让「以后可能要加的东西」
 * 有地方放 —— 比如流式进度回调 —— 而不用去改每一个调用点。
 */
export interface RunCtx {
  /** 上游产出表 */
  vars: VarContext;
  /** AI 服务的地址与密钥 */
  settings: ApiSettings;
  /** 当前所有连线（判断分支走哪条、找上游都靠它） */
  edges: Edge[];
  /** 中断信号：用户点「停下」时会触发 */
  signal: AbortSignal;
  /** 推日志给界面 */
  onLog: (e: LogEntry) => void;
  /** 中途报进度（比如「正在画图，已等 8 秒」）；可选，不传就当没有 */
  onProgress?: (msg: string) => void;
}

/** 便捷别名：画布上的节点 */
export type FlowNode = Node<FlowNodeData>;
