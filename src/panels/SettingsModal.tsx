import { useEffect, useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import type { ApiSettings, VaultItem, VaultSettings } from '../types';
import { CloseIcon } from '../lib/icons';
import { AI_PRESETS, findPresetByBaseURL } from '../presets/aiProviders';
import { BUILTIN_AI } from '../lib/builtinCredentials';

/**
 * 界面上的 AI 设置。
 *
 * 【默认形态：没有任何要填的东西】
 * 打开就是能用的状态 —— 应用自带一份免费 AI 的配置，用户不需要填地址、
 * 不需要填钥匙、也不需要知道有这些东西。设置界面默认只显示「你现在用的是
 * 免费 AI，直接开跑」这一句。
 *
 * 【想换别家怎么办】
 * 把界面切到「全都要」，才会出现服务商卡片和填写框。也就是说，
 * 填东西是少数人的进阶需求，不是所有人的必经步骤。
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useFlowStore((s) => s.settings);
  const saveSettings = useFlowStore((s) => s.saveSettings);
  const mode = useFlowStore((s) => s.mode);
  const vault = useFlowStore((s) => s.vault);
  const vaultItems = useFlowStore((s) => s.vaultItems);
  const vaultStatus = useFlowStore((s) => s.vaultStatus);
  const saveVaultSettings = useFlowStore((s) => s.saveVaultSettings);
  const loadVault = useFlowStore((s) => s.loadVault);
  const saveVaultItem = useFlowStore((s) => s.saveVaultItem);
  const removeVaultItem = useFlowStore((s) => s.removeVaultItem);
  const applyVaultItem = useFlowStore((s) => s.applyVaultItem);

  const [draft, setDraft] = useState<ApiSettings>(settings);
  const [vaultDraft, setVaultDraft] = useState<VaultSettings>(vault);
  const [showVault, setShowVault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const active = findPresetByBaseURL(draft.baseURL);
  // 现在用的就是自带的那份免费 AI —— 用来决定界面上说哪一句话
  const usingBuiltin =
    draft.baseURL.replace(/\/+$/, '') === BUILTIN_AI.baseURL.replace(/\/+$/, '') &&
    draft.apiKey === BUILTIN_AI.apiKey;

  // 打开时，如果之前配过保管箱就顺手连一次，省得用户再点一下
  useEffect(() => {
    if (vault.url.trim() && vault.key.trim()) void loadVault();
    // 只在打开时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    saveSettings(draft);
    saveVaultSettings(vaultDraft);
    onClose();
  };

  /** 一键套用某个预设：只改地址和默认模型 */
  const usePreset = (baseURL: string, model: string) => {
    setDraft((d) => ({ ...d, baseURL, model: model || d.model }));
  };

  /** 把这套 AI 设置存进保管箱，以后换台电脑直接取 */
  const stashToVault = async () => {
    if (!vaultDraft.url.trim() || !vaultDraft.key.trim()) {
      setMsg('保管箱还没准备好');
      setShowVault(true);
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      // 保存的是草稿里的最新值，而不是已经存过的设置
      saveVaultSettings(vaultDraft);
      const pick = AI_PRESETS.find((p) => p.baseURL === draft.baseURL);
      const item: VaultItem = {
        name: pick ? pick.name : draft.baseURL.replace(/^https?:\/\//, '') || '我的 AI',
        kind: 'ai_service',
        payload: { ...draft },
        is_default: true,
      };
      await saveVaultItem(item);
      await loadVault();
      setMsg('已存进保管箱');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          AI 设置
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body">
          {/* ---------- 简单点模式：一句话交代清楚，没有任何要填的 ---------- */}
          {mode === 'basic' ? (
            <div className="builtin-ai">
              <div className="builtin-ai__badge">已开通</div>
              <div className="builtin-ai__title">你正在用免费 AI，直接就能跑</div>
              <div className="builtin-ai__desc">
                地址、钥匙都已经配好，不用填任何东西。左侧拖一个节点出来，写清楚要它做什么，
                点右上角的「运行」就行。
              </div>
              <div className="builtin-ai__row">
                <span className="builtin-ai__label">用的哪个</span>
                <span className="builtin-ai__value">免费 AI（Agnes）</span>
              </div>
              <div className="builtin-ai__row">
                <span className="builtin-ai__label">要不要花钱</span>
                <span className="builtin-ai__value">免费额度，不用绑卡</span>
              </div>
              <div className="builtin-ai__tip">
                想换成自己的 AI？左上角把界面切到「全都要」，这里就会出现可以填的地方。
              </div>
            </div>
          ) : (
            <>
              {/* ---------- 全都要模式：完整的、可改的设置 ---------- */}
              {usingBuiltin && (
                <div className="builtin-ai builtin-ai--compact">
                  <div className="builtin-ai__title">当前用的是自带的免费 AI</div>
                  <div className="builtin-ai__desc">
                    下面这些都已经配好了。除非你想换成自己的，否则不用动。
                  </div>
                </div>
              )}

              <div className="preset">
                <div className="preset__title">换成别家</div>
                <div className="preset__list">
                  {AI_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      className={`preset__card${active?.id === p.id ? ' is-active' : ''}`}
                      onClick={() => usePreset(p.baseURL, p.model)}
                      title={p.baseURL}
                    >
                      <span className="preset__name">{p.name}</span>
                      <span className="preset__note">{p.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span className="field__label">
                  服务地址
                  <span className="field__hint">
                    {active?.lock ? '这家是配套的，不用改' : '从你用的 AI 服务商那里复制过来的'}
                  </span>
                </span>
                <input
                  className="input input--mono"
                  value={draft.baseURL}
                  onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  readOnly={!!active?.lock}
                />
              </div>

              <div className="field">
                <span className="field__label">
                  密钥
                  <span className="field__hint">服务商给你的那串密码</span>
                </span>
                <input
                  className="input input--mono"
                  type="password"
                  value={draft.apiKey}
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                  placeholder="换成自己的 AI 时才需要填"
                />
                <span className="field__hint">只存在你自己电脑的浏览器里</span>
              </div>

              <div className="field">
                <span className="field__label">
                  默认用哪个
                  <span className="field__hint">
                    {active?.lock ? '这家就这一个，已经定好' : '节点里不单独改的话，就用这个'}
                  </span>
                </span>
                <input
                  className="input input--mono"
                  value={draft.model}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  placeholder="gpt-4o-mini"
                  readOnly={!!active?.lock}
                />
              </div>

              <div className="field">
                <span className="field__label">
                  网络中转
                  <span className="field__hint">有些网站不允许网页直接访问，靠它绕过</span>
                </span>
                <input
                  className="input input--mono"
                  value={draft.proxyURL}
                  onChange={(e) => setDraft({ ...draft, proxyURL: e.target.value })}
                  placeholder="留空就直连"
                />
                <span className="field__hint">
                  访问网址、读网页这类节点会先试直连；被拦住时自动改走这里填的地址。
                </span>
              </div>

              {/* ---------- 云端保管箱（进阶） ---------- */}
              <div className="vault">
                <button className="vault__toggle" onClick={() => setShowVault((v) => !v)}>
                  <span className="vault__arrow">{showVault ? '▾' : '▸'}</span>
                  云端保管箱
                  <span className="field__hint">
                    {vaultStatus.state === 'ok'
                      ? `里面存了 ${vaultItems.length} 条`
                      : vaultDraft.url.trim() && vaultDraft.key.trim()
                        ? '把私密信息集中存起来，换台电脑也能用'
                        : '还没设置'}
                  </span>
                </button>

                {showVault && (
                  <div className="vault__body">
                    <div className="field">
                      <span className="field__label">保管箱地址</span>
                      <input
                        className="input input--mono"
                        value={vaultDraft.url}
                        onChange={(e) => {
                          setVaultDraft({ ...vaultDraft, url: e.target.value });
                          setMsg('');
                        }}
                        placeholder="https://xxxxx.supabase.co"
                      />
                    </div>

                    <div className="field">
                      <span className="field__label">开启保管箱的钥匙</span>
                      <input
                        className="input input--mono"
                        type="password"
                        value={vaultDraft.key}
                        onChange={(e) => {
                          setVaultDraft({ ...vaultDraft, key: e.target.value });
                          setMsg('');
                        }}
                        placeholder="很长的一串"
                      />
                      <span className="field__hint">只存在你自己电脑的浏览器里</span>
                    </div>

                    <div className="vault__actions">
                      <button
                        className="btn btn--tiny is-text"
                        onClick={() => {
                          saveVaultSettings(vaultDraft);
                          void loadVault();
                        }}
                        disabled={vaultStatus.state === 'connecting'}
                      >
                        {vaultStatus.state === 'connecting' ? '连接中…' : '测试连接'}
                      </button>
                      <button
                        className="btn btn--tiny is-text"
                        onClick={() => void stashToVault()}
                        disabled={saving}
                      >
                        {saving ? '保存中…' : '把上面这套存进去'}
                      </button>
                    </div>

                    {vaultStatus.state === 'error' && (
                      <div className="vault__err">{vaultStatus.note}</div>
                    )}

                    {vaultItems.length > 0 && (
                      <div className="vault__items">
                        <div className="vault__items-title">保管箱里已有的</div>
                        {vaultItems.map((it) => (
                          <div className="vault__item" key={it.id ?? it.name}>
                            <span className="vault__item-name">{it.name}</span>
                            {it.kind === 'ai_service' && (
                              <button
                                className="btn btn--tiny is-text"
                                onClick={() => {
                                  applyVaultItem(it);
                                  setDraft((d) => ({
                                    ...d,
                                    baseURL: String(
                                      (it.payload as ApiSettings).baseURL ?? d.baseURL,
                                    ),
                                    apiKey: String((it.payload as ApiSettings).apiKey ?? d.apiKey),
                                    model: String((it.payload as ApiSettings).model ?? d.model),
                                  }));
                                  setMsg(`已套用「${it.name}」`);
                                }}
                              >
                                用这个
                              </button>
                            )}
                            <button
                              className="btn btn--tiny btn--ghost is-text"
                              onClick={() => {
                                if (it.id) void removeVaultItem(it.id);
                              }}
                              disabled={!it.id}
                            >
                              删掉
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {msg && <div className="settings__msg">{msg}</div>}
        </div>

        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>
            算了
          </button>
          <button className="btn btn--primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
