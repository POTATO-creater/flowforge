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
            <StopIcon /> 停下
          </button>
        ) : (
          <button className="btn btn--primary" onClick={onRun}>
            <PlayIcon /> 跑一遍
          </button>
        )}
      </div>

      {/* 模式切换：小白 / 大佬 */}
      <div className="mode-switch" role="group" aria-label="界面模式">
        <button
          className={`mode-switch__btn ${mode === 'basic' ? 'is-active' : ''}`}
          onClick={() => setMode('basic')}
          title="只留最必要的设置，省心"
        >
          简单点
        </button>
        <button
          className={`mode-switch__btn ${mode === 'pro' ? 'is-active' : ''}`}
          onClick={() => setMode('pro')}
          title="把所有能调的选项都摊开"
        >
          全都要
        </button>
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <button className="btn" onClick={onOpenTemplates} title="用现成的例子开始">
          <TemplatesIcon /> 现成的
        </button>
        <button className="btn" onClick={onOpenSkills} title="技能库 / 导入技能">
          <SkillIcon /> 技能
        </button>
        <button className="btn" onClick={onExportJson} title="把工作流存成文件">
          <DownloadIcon /> 存下来
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} title="从文件载入工作流">
          <UploadIcon /> 打开
        </button>
        <button className="btn" onClick={() => exportCanvasPng(getNodes())} title="把画布存成图片">
          <ImageIcon /> 截图
        </button>
        <button className="btn btn--icon" onClick={onOpenSettings} title="AI 接口设置">
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
