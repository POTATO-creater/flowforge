// ============================================================
// 统一的通知出口：想提醒用户点什么，喊一嗓子就行
//
// 以前每个面板自己管自己的小气泡，样式和时机各不相同。
// 现在统一走这里：任何模块（包括不碰界面的引擎）都可以
// toast('…')，界面上的 <ToastHost /> 会统一显示、统一消失。
// ============================================================

type Listener = (msg: string) => void;

const listeners = new Set<Listener>();

/** 弹一条通知，2.6 秒后自动消失 */
export function toast(msg: string): void {
  if (!msg) return;
  for (const l of listeners) l(msg);
}

/** 订阅通知（界面挂载时用）。返回取消订阅的函数 */
export function onToast(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
