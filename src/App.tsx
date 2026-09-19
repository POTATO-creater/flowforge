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
import { downloadWorkflowJSON, readWorkflowFile } from './lib/persistence';
import { runWorkflow, stopWorkflow, type LogEntry } from './engine/execute';

// 节点类型映射（模块级稳定引用，避免 React Flow 告警）
const nodeTypes: NodeTypes = { flow: FlowNode };

// MiniMap 配色（React Flow 需要实际颜色值）
const MINIMAP_COLOR: Record<NodeKind, string> = {
  start: '#6ea8fe',
  llm: '#34e3b0',
  tool: '#f5b14c',
  condition: '#c792ea',
  code: '#8be9fd',
  output: '#ff9e64',
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const pushLog = useCallback((e: LogEntry) => setLogs((prev) => [...prev, e]), []);

  // 双击节点库 -> 在画布中心落点
  useEffect(() => {
    const handler = (ev: Event) => {
      const kind = (ev as CustomEvent<NodeKind>).detail;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      addNodeAt(kind, pos);
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
        loadWorkflowJSON(wf);
        setLogs([{ t: now(), tag: 'ok', msg: `已导入工作流：${wf.name}（${wf.nodes.length} 个节点）` }]);
      } catch (err) {
        setLogs([{ t: now(), tag: 'err', msg: `导入失败：${err instanceof Error ? err.message : String(err)}` }]);
      }
    },
    [loadWorkflowJSON],
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
      <Toolbar
        running={running}
        onRun={handleRun}
        onStop={handleStop}
        onExportJson={handleExportJson}
        onImportFile={handleImportFile}
        onClear={handleClear}
        onOpenSettings={() => setShowSettings(true)}
      />

      <Sidebar />

      <div className="app__canvas">
        {noApiKey && (
          <div className="banner">
            尚未配置 API Key，含「大模型」节点的运行会失败 · 点右上角 ⚙ 设置
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
                <h2>从左侧拖入节点开始</h2>
                <p>
                  一个「开始」节点 + 一个「大模型」节点，连一条线，
                  <br />
                  点「运行」即可真实调用模型。
                </p>
              </div>
            </div>
          )}
        </div>

        <LogsPanel logs={logs} />
      </div>

      <Inspector />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
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
