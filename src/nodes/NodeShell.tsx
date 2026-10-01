import { Handle, Position } from '@xyflow/react';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { RunStatus, RunInfo } from '../types';
import { readableOutput, clip, outputImage, outputVideo } from '../lib/preview';
import { CountUp } from '../lib/CountUp';
import { ImageViewer } from '../components/ImageViewer';

interface SourceHandleDef {
  id: string;
  label?: string;
  top: string; // CSS top 位置
}

interface NodeShellProps {
  label: string;
  kindLabel: string;
  colorVar: string;
  selected?: boolean;
  status?: RunStatus;
  /** 该节点本次运行的信息，用于在卡片上直接显示结果 */
  run?: RunInfo;
  hasTarget?: boolean;
  sources?: SourceHandleDef[];
  children?: ReactNode;
  /** 运行视图下是否被压暗（还没跑到 / 被跳过） */
  dim?: boolean;
  /** 拖线时：这个节点能不能连（高亮 / 变灰） */
  compatible?: 'yes' | 'no';
  /** 是否打了断点 */
  breakpoint?: boolean;
}

export function NodeShell({
  label,
  kindLabel,
  colorVar,
  selected,
  status,
  run,
  hasTarget = true,
  sources = [{ id: 'out', top: '50%' }],
  children,
  dim,
  compatible,
  breakpoint,
}: NodeShellProps) {
  const st = status ?? 'idle';
  const result = run?.status === 'success' ? readableOutput(run.output) : '';
  const { text: shown, clipped } = clip(result, 160);
  const chars = result.length;
  // 出图这类结果是一张图片，卡片上直接把图贴出来，不用去别处找
  const pic = run?.status === 'success' ? outputImage(run.output) : '';
  // 做视频这类结果是一段视频，卡片上直接放一个能播的
  const vid = run?.status === 'success' ? outputVideo(run.output) : '';

  // 「已等 N 秒」实时计时：只在跑着的时候走秒
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (run?.status !== 'running' || !run.startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - run.startedAt!) / 1000)));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [run?.status, run?.startedAt]);

  // 流式内容太长时只看最新的尾巴（看最新的才对，旧的开头没人关心）
  const partial = run?.status === 'running' ? run.partial ?? '' : '';
  const partialTail =
    partial.length > 220 ? `…${partial.slice(-220)}` : partial;

  // 点小图 -> 页内放大看（数据图不能新标签打开，浏览器会拦）
  const [viewing, setViewing] = useState(false);

  return (
    <div
      className="node"
      data-status={st}
      data-selected={selected}
      data-dim={dim ? 'true' : undefined}
      data-compatible={compatible}
      data-breakpoint={breakpoint ? 'true' : undefined}
      style={{ '--node-color': `var(${colorVar})` } as CSSProperties}
    >
      {hasTarget && <Handle type="target" position={Position.Left} />}

      <div className="node__head">
        <span className="node__dot" style={{ background: `var(${colorVar})` }} />
        <span className="node__kind">{kindLabel}</span>
        <span className="node__title">{label}</span>
        {run && run.status !== 'idle' && (
          <span className="node__status" data-state={run.status}>
            {run.status === 'running' && '跑中'}
            {run.status === 'success' && '✓'}
            {run.status === 'error' && '✕'}
          </span>
        )}
      </div>

      <div className="node__body">
        {children}

        {/* 跑完之后，结果直接显示在卡片上，不用再去别处翻 */}
        {run && run.status !== 'idle' && (
          <div className="node__result" data-state={run.status}>
            <div className="node__result-head">
              <span className="node__result-label">
                {run.status === 'running' && '正在跑…'}
                {run.status === 'success' && '跑好了'}
                {run.status === 'error' && '没跑通'}
              </span>
              {run.status === 'success' && typeof run.durationMs === 'number' && (
                <span className="node__result-meta">
                  {chars > 0 ? (
                    <>
                      <CountUp value={chars} suffix=" 个字" /> ·{' '}
                    </>
                  ) : null}
                  <CountUp value={run.durationMs} suffix=" 毫秒" />
                </span>
              )}
            </div>

            {run.status === 'success' && shown && (
              <div className="node__result-text">
                {shown}
                {clipped && <span className="node__result-more">…（还有更多，点开右侧看全文）</span>}
              </div>
            )}

            {/* 结果是图片就直接贴出来；点一下在页内放大看 */}
            {pic && (
              <button
                type="button"
                className="node__result-img"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewing(true);
                }}
                title="点一下放大看"
              >
                <img src={pic} alt="这次跑出来的图" />
              </button>
            )}

            {/* 结果是视频就直接放一个能播的（不用跳去别处看） */}
            {vid && (
              <div className="node__result-video" onClick={(e) => e.stopPropagation()}>
                <video src={vid} controls preload="metadata" playsInline />
              </div>
            )}

            {run.status === 'success' && !shown && !pic && !vid && (
              <div className="node__result-text node__result-text--empty">（这次没有产出内容）</div>
            )}

            {run.status === 'error' && (
              <div className="node__result-text node__result-text--error">{run.error}</div>
            )}

            {/* 跑着的时候：一句话进度 + 已经蹦出来的字 + 闪烁光标 */}
            {run.status === 'running' && (
              <>
                {run.note && (
                  <div className="node__result-note">
                    {run.note}
                    {elapsed > 0 && `，已等 ${elapsed} 秒`}
                  </div>
                )}
                {partialTail && (
                  <div className="node__result-text node__result-partial">
                    {partialTail}
                    <span className="node__cursor" />
                  </div>
                )}
                <div className="node__result-bar" />
              </>
            )}
          </div>
        )}
      </div>

      {sources.map((s) => (
        <Handle
          key={s.id}
          id={s.id}
          type="source"
          position={Position.Right}
          style={{ top: s.top }}
        />
      ))}

      {/* 放大看图（渲染到页面最上层，不受画布裁剪） */}
      {viewing && pic && (
        <ImageViewer src={pic} title={label} onClose={() => setViewing(false)} />
      )}
    </div>
  );
}
