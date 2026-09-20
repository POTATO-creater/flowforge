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
import { downloadWorkflowJSON, readWorkflowFile } from './lib/persistence';
import { runWorkflow, stopWorkflow, type LogEntry } from './engine/execute';

// 节点类型映射（模块级稳定引用，避免 React Flow 告警）
const nodeTypes: NodeTypes = { flow: FlowNode };

// MiniMap 配色（React Flow 需要实际颜色值）
const MINIMAP_COLOR: Record<NodeKind, string> = {
  start: '#6ea8fe',
  llm: '#34e3b0',
  chain: '#7fe3a0',
  agent: '#9d8cff',
  tool: '#f5b14c',
  fetch: '#4cc9f0',
  condition: '#c792ea',
  merge: '#ffd166',
  loop: '#f78fb3',
  code: '#8be9fd',
  output: '#ff9e64',
  // 数据整理：同一色系（青蓝→蓝紫），互相拉不开但成组可辨
  pick: '#5ec8d8',
  filter: '#63b8e8',
  sort: '#6aa9f0',
  limit: '#7599e6',
  dedupe: '#8089dc',
  splitout: '#8b7ad2',
  aggregate: '#966bc8',
  summarize: '#a15cbe',
  renamekeys: '#ac4db4',
  // 文字处理：暖橙→砖红
  markdown: '#e8a04a',
  html: '#e8955a',
  xml: '#e88a6a',
  findreplace: '#e87f7a',
  slice: '#e8748a',
  // 日期与编码：绿色系
  datetime: '#8fd47a',
  crypto: '#a3d96a',
  encode: '#b7de5a',
  totp: '#cbe34a',
  jwt: '#dfe83a',
  // 网络
  hn: '#58b8f0',
  rss: '#5fa6ea',
  chart: '#6b93e0',
  fact: '#7a80d6',
  // 流程控制
  wait: '#b98ce0',
  switch: '#a878d8',
  stop: '#d06090',
};

function Editor() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const addNodeAt = useFlowStore((s) => s.addNodeAt);
  const setSelected = useFlowStore((s) => s.setSelected);
  const running = useFlowStore((s) => s.running);
  const settings = useFlowStore((s) => s.settings);
  const serialize = useFlowStore((s) => s.serialize);
  const loadWorkflowJSON = useFlowStore((s) => s.loadWorkflowJSON);
  const clear = useFlowStore((s) => s.clear);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const pushLog = useCallback((e: LogEntry) => setLogs((prev) => [...prev, e]), []);

  // 本地调试用：把 store 挂到 window，方便在浏览器控制台里检查画布状态
  useEffect(() => {
    if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
      (window as unknown as Record<string, unknown>).__ffStore = useFlowStore;
    }
  }, []);

  // 双击节点库 -> 沿一条斜线依次错开落点，避免多个节点完全重叠
  useEffect(() => {
    const handler = (ev: Event) => {
      const kind = (ev as CustomEvent<NodeKind>).detail;
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
    };
    window.addEventListener('flowforge:add', handler);
    return () => window.removeEventListener('flowforge:add', handler);
  }, [screenToFlowPosition, addNodeAt]);

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
    if (confirm('确定清空画布？此操作不可撤销。')) {
      clear();
      setLogs([]);
    }
  }, [clear]);

  const noApiKey = !settings.apiKey;

  return (
    <div className="app">
      <div className="app__toolbar">
        <Toolbar
          running={running}
          onRun={handleRun}
          onStop={handleStop}
          onExportJson={handleExportJson}
          onImportFile={handleImportFile}
          onClear={handleClear}
          onOpenSettings={() => setShowSettings(true)}
          onOpenTemplates={() => setShowTemplates(true)}
          onOpenSkills={() => setShowSkills(true)}
        />
      </div>

      <div className="app__sidebar">
        <Sidebar />
      </div>

      <div className="app__canvas">
        {noApiKey && (
          <div className="banner">
            还没填 AI 的密钥，用到 AI 的节点跑不起来
            <button className="banner__link" onClick={() => setShowSettings(true)}>
              去填一下
            </button>
          </div>
        )}
        <div className="canvas-wrap" ref={wrapperRef} onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n.id)}
            onPaneClick={() => setSelected(null)}
            fitView
            fitViewOptions={{ padding: 0.35, maxZoom: 1, minZoom: 0.4 }}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            minZoom={0.2}
            maxZoom={2.5}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.07)" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => MINIMAP_COLOR[(n.data as FlowNodeData).kind] ?? '#888'}
              maskColor="rgba(11,14,19,0.7)"
            />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="canvas-empty">
              <div className="canvas-empty__inner">
                <h2>这里空空如也</h2>
                <p>
                  最快的办法是直接用现成的例子，点下面的按钮看看。
                  <br />
                  想自己搭也行，把左边的方块拖过来就好。
                </p>
                <button className="btn btn--primary canvas-empty__cta" onClick={() => setShowTemplates(true)}>
                  看看有什么现成的
                </button>
              </div>
            </div>
          )}
        </div>

        <LogsPanel logs={logs} />
      </div>

      <div className="app__inspector">
        <Inspector />
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showTemplates && <PresetsModal onClose={() => setShowTemplates(false)} />}
      {showSkills && <SkillsModal onClose={() => setShowSkills(false)} />}
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
