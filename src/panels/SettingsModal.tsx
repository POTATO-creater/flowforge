import { useEffect, useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import type { ApiSettings, VaultItem, VaultSettings } from '../types';
import { CloseIcon } from '../lib/icons';
import { AI_PRESETS, findPresetByBaseURL } from '../presets/aiProviders';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useFlowStore((s) => s.settings);
  const saveSettings = useFlowStore((s) => s.saveSettings);
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

  /** 一键套用某个预设：只改地址和默认模型，钥匙保持用户已经填的 */
  const usePreset = (baseURL: string, model: string) => {
    setDraft((d) => ({ ...d, baseURL, model: model || d.model }));
  };

  /** 把这套 AI 设置存进保管箱，以后换台电脑直接取 */
  const stashToVault = async () => {
    if (!vaultDraft.url.trim() || !vaultDraft.key.trim()) {
      setMsg('先把上面的保管箱地址和钥匙填上');
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
          AI 接口设置
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body">
          {/* ---------- 快速开始：一键填好地址 ---------- */}
          <div className="preset">
            <div className="preset__title">快速开始</div>
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
            <div className="preset__hint">
              点一下自动填好地址。钥匙要你自己去对应网站注册后拿一串过来。
            </div>
          </div>

          <div className="field">
            <span className="field__label">
              服务地址
              <span className="field__hint">
                {active?.lock ? '这家是配套的，不用改' : '从你用的 AI 服务商那里复制的「接口地址」'}
              </span>
            </span>
            <input
              className="input input--mono"
              value={draft.baseURL}
              onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
              placeholder="https://api.openai.com/v1"
              readOnly={!!active?.lock}
            />
            <span className="field__hint">
              {active?.lock
                ? '想换别家的话，点上面另外那几张卡片'
                : 'DeepSeek、智谱、通义等都能用，填它们给的地址就行'}
            </span>
          </div>

          <div className="field">
            <span className="field__label">
              密钥
              <span className="field__hint">服务商给你的那串密码，形如 sk- 开头</span>
            </span>
            <input
              className="input input--mono"
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="sk-..."
            />
            <span className="field__hint">只存在你自己电脑的浏览器里，不会传到别处</span>
          </div>

          <div className="field">
            <span className="field__label">
              默认用哪个 AI
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
            {active?.lock && (
              <span className="field__hint">
                「{active.name}」用的就是这一个模型，不用挑。
              </span>
            )}
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
              访问网址、读网页、读订阅这类节点，会先试着直接访问；被网站拦住时，自动改用这里填的地址绕过去。留空就是完全不中转。
            </span>
          </div>

          {/* ---------- 云端保管箱 ---------- */}
          <div className="vault">
            <button className="vault__toggle" onClick={() => setShowVault((v) => !v)}>
              <span className="vault__arrow">{showVault ? '▾' : '▸'}</span>
              云端保管箱
              <span className="field__hint">
                {vaultStatus.state === 'ok'
                  ? vaultStatus.note
                  : vaultStatus.state === 'error'
                    ? '没连上'
                    : vaultDraft.url.trim() && vaultDraft.key.trim()
                      ? '把私密信息集中存起来，换台电脑也能用'
                      : '还没设置。把私密信息集中存起来，换台电脑也能用'}
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
                  <span className="field__hint">
                    你的私密信息都存这儿。这个地址是你的保管箱专属的，别人拿到也没用。
                  </span>
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
                  <span className="field__hint">
                    只存在你自己电脑的浏览器里，不会传给别处。这是打开保管箱的那把锁。
                  </span>
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
                  <button className="btn btn--tiny is-text" onClick={() => void stashToVault()} disabled={saving}>
                    {saving ? '保存中…' : '把上面这套 AI 存进去'}
                  </button>
                </div>

                {vaultStatus.state === 'error' && (
                  <div className="vault__err">{vaultStatus.note}</div>
                )}
                {vaultStatus.state === 'ok' && <div className="vault__ok">{vaultStatus.note}</div>}

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
                                baseURL: String((it.payload as ApiSettings).baseURL ?? d.baseURL),
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

                {vaultStatus.state !== 'ok' && (
                  <div className="vault__help">
                    还没建保管箱？去 supabase.com 免费建一个项目，在 SQL 编辑器里执行一次建表语句，
                    然后把项目地址和那把长钥匙填到上面。
                  </div>
                )}
              </div>
            )}
          </div>

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
