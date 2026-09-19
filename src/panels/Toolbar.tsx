import { useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { exportCanvasPng } from '../lib/png';
import {
  PlayIcon,
  StopIcon,
  DownloadIcon,
  UploadIcon,
  ImageIcon,
  SettingsIcon,
  TrashIcon,
} from '../lib/icons';

interface ToolbarProps {
  running: boolean;
  onRun: () => void;
  onStop: () => void;
  onExportJson: () => void;
  onImportFile: (file: File) => void;
  onClear: () => void;
  onOpenSettings: () => void;
}

export function Toolbar({
  running,
  onRun,
  onStop,
  onExportJson,
  onImportFile,
  onClear,
  onOpenSettings,
}: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { getNodes } = useReactFlow();

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__logo">F</span>
        FlowForge <small>AI 工作流编辑器</small>
      </div>

      <div className="toolbar__group">
        {running ? (
          <button className="btn btn--danger" onClick={onStop}>
            <StopIcon /> 停止
          </button>
        ) : (
          <button className="btn btn--primary" onClick={onRun}>
            <PlayIcon /> 运行
          </button>
        )}
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <button className="btn" onClick={onExportJson} title="导出工作流 JSON">
          <DownloadIcon /> 导出
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} title="导入工作流 JSON">
          <UploadIcon /> 导入
        </button>
        <button className="btn" onClick={() => exportCanvasPng(getNodes())} title="导出画布为 PNG">
          <ImageIcon /> 图片
        </button>
        <button className="btn btn--icon" onClick={onOpenSettings} title="API 设置">
          <SettingsIcon />
        </button>
        <button className="btn btn--icon btn--danger" onClick={onClear} title="清空画布">
          <TrashIcon />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f);
          e.target.value = '';
        }}
      />
    </header>
  );
}
