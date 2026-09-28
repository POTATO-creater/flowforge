// ============================================================
// 现成的 AI 服务预设
//
// 用户第一次打开设置时，最省事的路径不该是「去某网站注册、找到接口地址、
// 复制粘贴」——那对不写代码的人就是劝退。这里把常见的几家提前备好，
// 点一下就把地址和默认模型填进去，用户只需要再补一把钥匙。
//
// 注意：模型名必须是真的能用的，不能凭印象写。没有把握的一律留空，
// 让用户自己填，也好过填一个跑不通的让他反复试。
// ============================================================

export interface AIProviderPreset {
  id: string;
  /** 界面上显示的名字 */
  name: string;
  /** 一句话说明，讲清楚要准备什么 */
  note: string;
  /** 服务地址，直接写进「服务地址」那一栏 */
  baseURL: string;
  /** 默认模型；留空表示不预设，交给用户填 */
  model: string;
  /** 是否建议填「网络中转」（默认不走） */
  needsProxy?: boolean;
  /**
   * 锁定：选中这一家后，地址和模型都不允许在界面上改。
   *
   * 目前只有免费 AI 是锁的——它的地址和模型是配套的，随便改一个就跑不通，
   * 与其让人改成坏配置再来报错，不如直接不给改。想换服务商的话，
   * 右边那几家仍然是敞开的。
   */
  lock?: boolean;
}

export const AI_PRESETS: AIProviderPreset[] = [
  {
    id: 'agnes',
    name: '免费 AI（Agnes）',
    note: '免费额度，开箱即用。只需再补一把钥匙',
    baseURL: 'https://apihub.agnes-ai.com/v1',
    // 实测可用（用真钥匙问过 /models 并跑通过一次对话）
    model: 'agnes-3.0-flash',
    lock: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    note: '国内直连，价格便宜，不用中转',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    note: '官方服务，国内访问可能需要填「网络中转」',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needsProxy: true,
  },
];

/** 按地址反查是哪个预设 —— 用来在界面上标出「当前用的是哪家」 */
export function findPresetByBaseURL(baseURL: string): AIProviderPreset | undefined {
  const norm = (s: string) => (s ?? '').trim().replace(/\/+$/, '').toLowerCase();
  const target = norm(baseURL);
  if (!target) return undefined;
  return AI_PRESETS.find((p) => norm(p.baseURL) === target);
}
