// ============================================================
// 编译期完整性检查
//
// 用途：给「按节点类型分发」的 switch 兜底。
// 写法：在 switch 末尾加 default 分支调用 assertNever(kind)。
//
// 为什么需要它：executeNode() 和 FlowNode() 都靠 switch 分发，
// 但 switch 漏写一个 case 在 TypeScript 里【不会报错】——只在运行时
// 悄悄什么都不做（节点不执行 / 卡片空白），极难排查。
// 加上 assertNever 后，只要 NodeKind 多了一种而某处没处理，
// 编译就会直接失败，把运行时隐患变成编译期错误。
// ============================================================

/**
 * 如果这个函数能被调用到，说明前面的 switch 漏掉了一种类型。
 * 参数类型被声明为 never，所以只要传进来的是真实值，编译就过不去。
 */
export function assertNever(value: never, where: string): never {
  throw new Error(
    `[完整性检查] ${where} 没有处理这种节点类型：${JSON.stringify(value)}。` +
      `这属于程序缺陷，请补上对应的分支。`,
  );
}
