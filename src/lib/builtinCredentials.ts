// ============================================================
// 内置凭据：让应用「打开就能用」，不需要任何人填任何东西
//
// 这个文件解决的问题：以前每换一台电脑、每换一个浏览器，都要重新填
// 「AI 的钥匙」和「保管箱的地址」，很烦。现在这些都随应用一起发出去，
// 打开就是能用的状态。
//
// 【关于安全，说实话】
// 这个应用整个跑在浏览器里。做到的是：
//   · 界面上不出现、设置里不显示、导出的代码里没有；
//   · 普通用户从头到尾看不到、也不需要任何填写。
// 做不到的是：懂技术的人按 F12 打开开发者工具，能在这里翻到这些字。
// 这是「纯网页应用」的固有性质 —— 应用要能连上网，就必然带着能连上网的凭证，
// 只是藏得深浅的区别。所以这里的钥匙请当成「公共资源」来管：
// 只放免费额度、随时可以在服务商后台一键换掉的那种。
// ============================================================

import type { VaultSettings } from '../types';

/**
 * 内置保管箱：指向一个已经建好表的 Supabase 项目，
 * 里面存着真正要用的那把 AI 钥匙。
 *
 * 用的是 Supabase 的「公开可用」那把钥匙（publishable），
 * 它的定位本来就是「放在网页里给人用的」，配合表上的访问规则一起作用。
 */
export const BUILTIN_VAULT: VaultSettings = {
  url: 'https://kyhcuosmspqxzmdsjsuq.supabase.co',
  key: 'sb_publishable_zFx_utJCc1a8exAxLeCQXQ_D01Ikmqr',
};

/**
 * 兜底用的 AI 服务：万一保管箱连不上（断网、服务临时抽风），
 * 或者它还没配好，就直接用这一份，保证「点开就能跑」这件事不会因为
 * 一个环节出问题而彻底不成立。
 *
 * 与保管箱里存的那条保持同一份内容，改的时候两边一起改。
 */
export const BUILTIN_AI = {
  baseURL: 'https://apihub.agnes-ai.com/v1',
  apiKey: 'sk-7grgeuInsydX5oDcosfNcCjk4INE7F8p94MPpNIi2Rj9U6U7',
  model: 'agnes-3.0-flash',
  proxyURL: '',
} as const;

/** 保管箱里的表名，内置与自建共用同一个 */
export const VAULT_TABLE = 'vault_items';
