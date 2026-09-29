import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useFlowStore } from './store/flowStore';
import { FlowNode } from './nodes/FlowNode';
import type { FlowNodeData, NodeKind } from './types';
import { Sidebar, DND_MIME } from './panels/Sidebar';
import { Inspector } from './panels/Inspector';
import { Toolbar } from './panels/Toolbar';
import { LogsPanel } from './panels/LogsPanel';
import { SettingsModal } from './panels/SettingsModal';
import { PresetsModal } from './panels/PresetsModal';
import { SkillsModal } from './panels/SkillsModal';
import { CommandPalette } from './panels/CommandPalette';
import { ShareModal } from './panels/ShareModal';
import { VersionsModal } from './panels/VersionsModal';
import { ExportCodeModal } from './panels/ExportCodeModal';
import { AIBuildModal } from './panels/AIBuildModal';
import { downloadWorkflowJSON, readWorkflowFile } from './lib/persistence';
import { runWorkflow, stopWorkflow, runSingleNode, type LogEntry } from './engine/execute';
import { readShareFromUrl } from './lib/share';
import { TemplatesIcon, PlusIcon, UploadIcon } from './lib/icons';

// 节点类型映射（模块级稳定引用，避免 React Flow 告警）
const nodeTypes: NodeTypes = { flow: FlowNode };

/**
 * MiniMap 的节点配色。
 *
 * 这里刻意不写死色值：React Flow 把 nodeColor 渲染成 SVG 的 style.fill，
 * 属于 CSS 属性，所以可以直接吃 CSS 变量。好处是节点色只有 tokens.css
 * 一个真源，切换亮/暗主题时浏览器自动重解析，不需要任何 JS 参与。
 */
const MINIMAP_COLOR: Record<NodeKind, string> = {
  start: 'var(--nt-start)',
  llm: 'var(--nt-llm)',
  chain: 'var(--nt-chain)',
  agent: 'var(--nt-agent)',
  tool: 'var(--nt-tool)',
  fetch: 'var(--nt-fetch)',
  condition: 'var(--nt-condition)',
  merge: 'var(--nt-merge)',
  loop: 'var(--nt-loop)',
  code: 'var(--nt-code)',
  output: 'var(--nt-output)',
  pick: 'var(--nt-pick)',
  filter: 'var(--nt-filter)',
  sort: 'var(--nt-sort)',
  limit: 'var(--nt-limit)',
  dedupe: 'var(--nt-dedupe)',
  splitout: 'var(--nt-splitout)',
  aggregate: 'var(--nt-aggregate)',
  summarize: 'var(--nt-summarize)',
  renamekeys: 'var(--nt-renamekeys)',
  markdown: 'var(--nt-markdown)',
  html: 'var(--nt-html)',
  xml: 'var(--nt-xml)',
  findreplace: 'var(--nt-findreplace)',
  slice: 'var(--nt-slice)',
  datetime: 'var(--nt-datetime)',
  crypto: 'var(--nt-crypto)',
  encode: 'var(--nt-encode)',
  totp: 'var(--nt-totp)',
  jwt: 'var(--nt-jwt)',
  hn: 'var(--nt-hn)',
  rss: 'var(--nt-rss)',
  chart: 'var(--nt-chart)',
  fact: 'var(--nt-fact)',
  mcpFetch: 'var(--nt-mcpfetch)',
  wait: 'var(--nt-wait)',
  switch: 'var(--nt-switch)',
  stop: 'var(--nt-stop)',
  watch: 'var(--nt-watch)',
  imageGen: 'var(--nt-imagegen)',
  imageEdit: 'var(--nt-imageedit)',
  imageMix: 'var(--nt-imagemix)',
};

function Editor() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const addNodeAt = useFlowStore((s) => s.addNodeAt);
  const deleteNode = useFlowStore((s) => s.deleteNode);
  const selectedId = useFlowStore((s) => s.selectedId);
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const canUndo = useFlowStore((s) => s.past.length > 0);
  const canRedo = useFlowStore((s) => s.future.length > 0);
  const running = useFlowStore((s) => s.running);
  const settings = useFlowStore((s) => s.settings);
  const serialize = useFlowStore((s) => s.serialize);
  const loadWorkflowJSON = useFlowStore((s) => s.loadWorkflowJSON);
  const clear = useFlowStore((s) => s.clear);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showAIBuild, setShowAIBuild] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [sharePrompt, setSharePrompt] = useState<import('./types').WorkflowJSON | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();
  const { screenToFlowPosition } = useReactFlow();

  const setConnecting = useFlowStore((s) => s.setConnecting);
  const deleteEdge = useFlowStore((s) => s.deleteEdge);
  const mockMode = useFlowStore((s) => s.mockMode);
  const setMockMode = useFlowStore((s) => s.setMockMode);
  const resolvedTheme = useFlowStore((s) => s.resolvedTheme);
  const applySystemTheme = useFlowStore((s) => s.applySystemTheme);

  // 把当前生效的主题写到 <html data-theme>，CSS 变量随之整套切换。
  // 首帧由 index.html 里的内联脚本先定好，这里负责后续的每次变化。
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  // 用户选了「跟随系统」时，系统外观一变界面就跟着变
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applySystemTheme();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [applySystemTheme]);

  // 打开别人分享的链接时，问一句要不要载入
  useEffect(() => {
    const wf = readShareFromUrl();
    if (wf) {
      setSharePrompt(wf);
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch {
        /* 清不掉 hash 也无所谓 */
      }
    }
  }, []);

  /*
   * 开机静默同步一次 AI 配置。
   *
   * 界面已经先用「内置的那份」渲染出来了，所以这一步不会让页面卡住或闪一下；
   * 它只是去云端问问「有没有更新的配置」，有就悄悄换上、没有就保持原样。
   * 静默的意义：不弹提示、不转圈 —— 用户的感觉只有一个「打开就能用」。
   */
  const syncBuiltinAI = useFlowStore((s) => s.syncBuiltinAI);
  useEffect(() => {
    void syncBuiltinAI();
  }, [syncBuiltinAI]);

  // 日志可能来得很密（尤其开了流式之后）。每次都 [...prev, e] 会让开销随条数
  // 平方增长，流程一长就拖慢整页。这里攒一小会儿再一次性落进 state：
  // 人眼看着仍是「实时」，但重渲染次数降到几十次之一。
  const logBuffer = useRef<LogEntry[]>([]);
  const logFlushTimer = useRef<number>();

  const pushLog = useCallback((e: LogEntry) => {
    logBuffer.current.push(e);
    if (logFlushTimer.current !== undefined) return;
    const flush = () => {
      const batch = logBuffer.current;
      logBuffer.current = [];
      logFlushTimer.current = undefined;
      if (batch.length) setLogs((prev) => [...prev, ...batch]);
    };
    flush(); // 第一条立即落库，避免「点了跑没反应」的观感
    logFlushTimer.current = window.setTimeout(flush, 60) as unknown as number;
  }, []);

  // 页面卸载前把没来得及落的日志清掉，避免定时器挂在卸载后的组件上
  useEffect(
    () => () => {
      window.clearTimeout(logFlushTimer.current);
    },
    [],
  );

  // 本地调试用：把 store 挂到 window，方便在浏览器控制台里检查画布状态
  useEffect(() => {
    if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
      (window as unknown as Record<string, unknown>).__ffStore = useFlowStore;
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600) as unknown as number;
  }, []);

  // 在画布中心附近落一个节点（双击节点库 / 空状态卡片 / 命令面板共用）
  const addNodeAtCenter = useCallback(
    (kind: NodeKind) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      // 以画布中心为基准，按已有节点数量做阶梯偏移
      const n = useFlowStore.getState().nodes.length;
      const step = n % 4;
      const col = Math.floor(n / 4);
      const offset = { x: (step - 1.5) * 250 + col * 30, y: (step - 1.5) * 150 + col * 30 };
      addNodeAt(kind, {
        x: center.x - 110 + offset.x,
        y: center.y - 40 + offset.y,
      });
    },
    [screenToFlowPosition, addNodeAt],
  );

  // 双击节点库 -> 沿一条斜线依次错开落点，避免多个节点完全重叠
  useEffect(() => {
    const handler = (ev: Event) => {
      const kind = (ev as CustomEvent<NodeKind>).detail;
      addNodeAtCenter(kind);
    };
    window.addEventListener('flowforge:add', handler);
    return () => window.removeEventListener('flowforge:add', handler);
  }, [addNodeAtCenter]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(DND_MIME) as NodeKind;
      if (!kind) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(kind, position);
    },
    [screenToFlowPosition, addNodeAt],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleRun = useCallback(() => {
    setLogs([]);
    void runWorkflow(pushLog);
  }, [pushLog]);

  const handleRunSingle = useCallback(
    (id: string) => {
      void runSingleNode(id, pushLog);
    },
    [pushLog],
  );

  const connecting = useFlowStore((s) => s.connecting);

  const handleStop = useCallback(() => stopWorkflow(), []);

  const handleExportJson = useCallback(() => downloadWorkflowJSON(serialize()), [serialize]);

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const wf = await readWorkflowFile(file);
        if (nodes.length > 0 && !confirm(`导入「${wf.name}」会覆盖当前画布（${nodes.length} 个节点），继续？`)) {
          return;
        }
        loadWorkflowJSON(wf);
        setLogs([{ t: now(), tag: 'ok', msg: `已导入工作流：${wf.name}（${wf.nodes.length} 个节点）` }]);
      } catch (err) {
        setLogs([{ t: now(), tag: 'err', msg: `导入失败：${err instanceof Error ? err.message : String(err)}` }]);
      }
    },
    [loadWorkflowJSON, nodes.length],
  );

  const handleClear = useCallback(() => {
    if (confirm('确定清空画布？清空后可以用 Ctrl/⌘ + Z 撤销找回。')) {
      clear();
      setLogs([]);
    }
  }, [clear]);

  // 全局快捷键：删除 / 撤销重做 / 保存 / 命令面板
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (paletteOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;

      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (mod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        useFlowStore.getState().persist();
        showToast('已存到本地');
        return;
      }
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }
      // 删除选中节点（仅在没在打字时）
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selectedId) {
        e.preventDefault();
        deleteNode(selectedId);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, undo, redo, deleteNode, selectedId, showToast]);

  const noApiKey = !settings.apiKey;

  return (
    <div className="app">
      <div className="app__toolbar">
        <Toolbar
          running={running}
          onRun={handleRun}
          onStop={handleStop}
          onExportJson={handleExportJson}
          onImportFile={(f) => void handleImportFile(f)}
          onClear={handleClear}
          onOpenSettings={() => setShowSettings(true)}
          onOpenTemplates={() => setShowTemplates(true)}
          onOpenSkills={() => setShowSkills(true)}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onCommand={() => setPaletteOpen(true)}
          onShare={() => setShowShare(true)}
          onVersions={() => setShowVersions(true)}
          onExport={() => setShowExport(true)}
          onAIBuild={() => setShowAIBuild(true)}
          mockMode={mockMode}
          onToggleMock={() => setMockMode(!mockMode)}
        />
      </div>

      <div className="app__sidebar">
        <Sidebar />
      </div>

      <div className="app__canvas">
        {noApiKey && (
          <div className="banner">
            自带的免费 AI 没接上（可能是网络问题）。用到 AI 的节点暂时跑不起来。
            <button className="banner__link" onClick={() => setShowSettings(true)}>
              看看怎么回事
            </button>
          </div>
        )}
        <div
          className={`canvas-wrap${connecting ? ' connecting' : ''}`}
          ref={wrapperRef}
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <ReactFlow
            className={running ? 'run-view' : ''}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={(_, p) =>
              p.nodeId && setConnecting({ nodeId: p.nodeId, handleType: (p.handleType as 'source' | 'target') ?? 'source' })
            }
            onConnectEnd={() => setConnecting(null)}
            onEdgeContextMenu={(e, edge) => {
              e.preventDefault();
              setEdgeMenu({ x: e.clientX, y: e.clientY, id: edge.id });
            }}
            onNodeClick={(_, n) => useFlowStore.getState().setSelected(n.id)}
            onPaneClick={() => {
              useFlowStore.getState().setSelected(null);
              setEdgeMenu(null);
            }}
            fitView
            fitViewOptions={{ padding: 0.35, maxZoom: 1, minZoom: 0.4 }}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: 'default' }}
            minZoom={0.2}
            maxZoom={2.5}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--canvas-dot)"
            />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => MINIMAP_COLOR[(n.data as FlowNodeData).kind] ?? 'var(--st-idle)'}
              maskColor="var(--canvas-mask)"
            />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="canvas-empty">
              <div className="canvas-empty__inner">
                <h2>这里空空如也</h2>
                <p>挑一种方式开始，随时都能改。</p>
                <div className="canvas-empty__cards">
                  <button className="start-card start-card--primary" onClick={() => setShowTemplates(true)}>
                    <span className="start-card__icon">
                      <TemplatesIcon size={18} />
                    </span>
                    <span className="start-card__title">挑个现成的例子</span>
                    <span className="start-card__desc">从模板库选一个，几秒就能跑起来。</span>
                  </button>
                  <button className="start-card" onClick={() => addNodeAtCenter('start')}>
                    <span className="start-card__icon">
                      <PlusIcon size={18} />
                    </span>
                    <span className="start-card__title">先放一个「开始」块</span>
                    <span className="start-card__desc">从零搭，拖进来第一个节点。</span>
                  </button>
                  <button className="start-card" onClick={() => importRef.current?.click()}>
                    <span className="start-card__icon">
                      <UploadIcon size={18} />
                    </span>
                    <span className="start-card__title">导入一份工作流</span>
                    <span className="start-card__desc">把导出的 .json 文件读进来。</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <LogsPanel logs={logs} />
      </div>

      <div className="app__inspector">
        <Inspector onRunSingle={handleRunSingle} />
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showTemplates && <PresetsModal onClose={() => setShowTemplates(false)} />}
      {showSkills && <SkillsModal onClose={() => setShowSkills(false)} />}
      {showShare && <ShareModal onClose={() => setShowShare(false)} />}
      {showVersions && <VersionsModal onClose={() => setShowVersions(false)} />}
      {showExport && <ExportCodeModal onClose={() => setShowExport(false)} />}
      {showAIBuild && <AIBuildModal onClose={() => setShowAIBuild(false)} />}
      {paletteOpen && (
        <CommandPalette
          running={running}
          onClose={() => setPaletteOpen(false)}
          onRun={handleRun}
          onStop={handleStop}
          onUndo={undo}
          onRedo={redo}
          onClear={handleClear}
          onOpenTemplates={() => {
            setPaletteOpen(false);
            setShowTemplates(true);
          }}
          onOpenSettings={() => {
            setPaletteOpen(false);
            setShowSettings(true);
          }}
          onExportJson={handleExportJson}
          onAddNode={addNodeAtCenter}
          onShare={() => {
            setPaletteOpen(false);
            setShowShare(true);
          }}
          onVersions={() => {
            setPaletteOpen(false);
            setShowVersions(true);
          }}
          onExportCode={() => {
            setPaletteOpen(false);
            setShowExport(true);
          }}
          onAIBuild={() => {
            setPaletteOpen(false);
            setShowAIBuild(true);
          }}
          onSaveVersion={() => {
            useFlowStore.getState().saveVersion();
            setPaletteOpen(false);
            showToast('已存为版本');
          }}
        />
      )}

      {toast && <div className="toast-inline app__toast">{toast}</div>}

      {/* 连线右键菜单 */}
      {edgeMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 69 }} onClick={() => setEdgeMenu(null)} />
          <div className="edge-menu" style={{ left: edgeMenu.x, top: edgeMenu.y }} role="menu">
            <button
              className="edge-menu__item is-danger"
              onClick={() => {
                deleteEdge(edgeMenu.id);
                setEdgeMenu(null);
              }}
            >
              删除这条连线
            </button>
          </div>
        </>
      )}

      {/* 别人分享的链接：问一句要不要载入 */}
      {sharePrompt && (
        <div className="modal-backdrop" onClick={() => setSharePrompt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              有人分享了一个工作流
              <button className="btn btn--icon btn--ghost" onClick={() => setSharePrompt(null)} aria-label="关闭">
                ✕
              </button>
            </div>
            <div className="modal__body">
              <p className="inspector__plain">
                链接里带着「{sharePrompt.name}」，要载入到画布上吗？当前内容会被覆盖（可以用 Ctrl/⌘ + Z 撤销）。
              </p>
            </div>
            <div className="modal__foot">
              <button className="btn" onClick={() => setSharePrompt(null)}>
                不用了
              </button>
              <button
                className="btn btn--primary"
                onClick={() => {
                  loadWorkflowJSON(sharePrompt, sharePrompt.name);
                  setSharePrompt(null);
                }}
              >
                载入
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function now(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
