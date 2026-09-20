import { useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFlowStore } from '../store/flowStore';
import { exportCanvasPng } from '../lib/png';
import {
  PlayIcon,
  StopIcon,
  DownloadIcon,
  UploadIcon,
  ImageIcon,
  SettingsIcon,
  TrashIcon,
  TemplatesIcon,
  SkillIcon,
} from '../lib/icons';

interface ToolbarProps {
  running: boolean;
  onRun: () => void;
  onStop: () => void;
  onExportJson: () => void;
  onImportFile: (file: File) => void;
  onClear: () => void;
  onOpenSettings: () => void;
  onOpenTemplates: () => void;
  onOpenSkills: () => void;
}

export function Toolbar({
  running,
  onRun,
  onStop,
  onExportJson,
  onImportFile,
  onClear,
  onOpenSettings,
  onOpenTemplates,
  onOpenSkills,
}: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { getNodes } = useReactFlow();
  const mode = useFlowStore((s) => s.mode);
  const setMode = useFlowStore((s) => s.setMode);

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

      {/* 模式切换：小白 / 大佬 */}
      <div className="mode-switch" role="group" aria-label="界面模式">
        <button
          className={`mode-switch__btn ${mode === 'basic' ? 'is-active' : ''}`}
          onClick={() => setMode('basic')}
          title="隐藏高级设置，只保留核心选项"
        >
          小白模式
        </button>
        <button
          className={`mode-switch__btn ${mode === 'pro' ? 'is-active' : ''}`}
          onClick={() => setMode('pro')}
          title="展示全部可调参数"
        >
          大佬模式
        </button>
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <button className="btn" onClick={onOpenTemplates} title="从模板快速创建">
          <TemplatesIcon /> 模板
        </button>
        <button className="btn" onClick={onOpenSkills} title="技能库 / 导入技能">
          <SkillIcon /> 技能
        </button>
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
