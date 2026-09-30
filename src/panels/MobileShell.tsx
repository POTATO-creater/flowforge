// ============================================================
// 手机端外壳：底部操作条 + 抽屉（节点库 / 日志）+ 属性全屏页
//
// 手机上屏幕就一条，塞不下桌面版的「左节点库 + 右属性 + 下日志」，
// 全都改成随手可唤出、随手可收起：
//   - 底部条四个大按钮，拇指够得着；
//   - 节点库、日志从底下滑上来（往下拉把手或点空白收起）；
//   - 属性页占满整屏，改完点「完成」回来。
// ============================================================
import { useState } from 'react';
import type { LogEntry } from '../engine/execute';
import { Sidebar } from './Sidebar';
import { LogsPanel } from './LogsPanel';
import { Inspector } from './Inspector';

interface MobileShellProps {
  running: boolean;
  logs: LogEntry[];
  /** 属性页开合（手机上点节点时由画布那边顺手打开） */
  sheetOpen: boolean;
  onOpenSheet: () => void;
  onCloseSheet: () => void;
  onRun: () => void;
  onStop: () => void;
  onRunSingle: (id: string) => void;
}

export function MobileShell({
  running,
  logs,
  sheetOpen,
  onOpenSheet,
  onCloseSheet,
  onRun,
  onStop,
  onRunSingle,
}: MobileShellProps) {
  // 两个抽屉共用一个「当前打开的是哪个」；同时只开一个
  const [drawer, setDrawer] = useState<'nodes' | 'logs' | null>(null);

  return (
    <>
      {/* —— 底部操作条 —— */}
      <nav className="mobile-bar">
        <button
          className={`btn${drawer === 'nodes' ? ' btn--primary' : ''}`}
          onClick={() => setDrawer(drawer === 'nodes' ? null : 'nodes')}
        >
          ＋ 节点
        </button>
        <button className="btn" onClick={onOpenSheet}>
          属性
        </button>
        <button className="btn" onClick={() => setDrawer(drawer === 'logs' ? null : 'logs')}>
          日志
        </button>
        <button
          className={`btn ${running ? '' : 'btn--primary'}`}
          onClick={running ? onStop : onRun}
          style={running ? { color: 'var(--st-error)' } : undefined}
        >
          {running ? '⏹ 停下' : '▶ 跑一遍'}
        </button>
      </nav>

      {/* —— 遮罩：任一抽屉开着就垫一层 —— */}
      {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(null)} />}

      {/* —— 节点库抽屉 —— */}
      <aside className="drawer" data-open={drawer === 'nodes'} aria-hidden={drawer !== 'nodes'}>
        <div className="drawer__grabber" onClick={() => setDrawer(null)} />
        <div className="drawer__head">
          <span className="drawer__title">挑一个节点放到画布上</span>
          <button className="btn btn--icon btn--ghost" onClick={() => setDrawer(null)} aria-label="收起">
            ✕
          </button>
        </div>
        <div className="drawer__body">
          {/* tapToAdd：手机上没有「拖拽」这回事，点一下就加一个 */}
          <Sidebar tapToAdd />
        </div>
      </aside>

      {/* —— 日志抽屉 —— */}
      <aside className="drawer" data-open={drawer === 'logs'} aria-hidden={drawer !== 'logs'}>
        <div className="drawer__grabber" onClick={() => setDrawer(null)} />
        <div className="drawer__head">
          <span className="drawer__title">运行记录</span>
          <button className="btn btn--icon btn--ghost" onClick={() => setDrawer(null)} aria-label="收起">
            ✕
          </button>
        </div>
        <div className="drawer__body">
          <LogsPanel logs={logs} />
        </div>
      </aside>

      {/* —— 属性全屏页 —— */}
      <aside className="sheet" data-open={sheetOpen} aria-hidden={!sheetOpen}>
        <div className="sheet__head">
          <span className="sheet__title">节点设置</span>
          <button className="btn btn--primary" onClick={onCloseSheet}>
            完成
          </button>
        </div>
        <div className="sheet__body">
          <Inspector onRunSingle={onRunSingle} />
        </div>
      </aside>
    </>
  );
}
