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
  UndoIcon,
  RedoIcon,
  SearchIcon,
  SparkIcon,
  SunIcon,
  MoonIcon,
  AutoThemeIcon,
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
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCommand: () => void;
  onShare: () => void;
  onVersions: () => void;
  onExport: () => void;
  onAIBuild: () => void;
  mockMode: boolean;
  onToggleMock: () => void;
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
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCommand,
  onShare,
  onVersions,
  onExport,
  onAIBuild,
  mockMode,
  onToggleMock,
}: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { getNodes } = useReactFlow();
  const mode = useFlowStore((s) => s.mode);
  const setMode = useFlowStore((s) => s.setMode);
  const theme = useFlowStore((s) => s.theme);
  const setTheme = useFlowStore((s) => s.setTheme);

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

      {/* 撤销 / 重做 */}
      <div className="toolbar__group">
        <button className="btn btn--icon" onClick={onUndo} disabled={!canUndo} title="撤销 (Ctrl/⌘ + Z)">
          <UndoIcon />
        </button>
        <button className="btn btn--icon" onClick={onRedo} disabled={!canRedo} title="重做 (Ctrl/⌘ + Shift + Z)">
          <RedoIcon />
        </button>
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

      {/* 主题：跟系统 / 亮色 / 暗色 */}
      <div className="mode-switch" role="group" aria-label="界面主题">
        <button
          className={`mode-switch__btn mode-switch__btn--icon ${theme === 'system' ? 'is-active' : ''}`}
          onClick={() => setTheme('system')}
          title="跟随系统外观"
          aria-label="跟随系统外观"
        >
          <AutoThemeIcon />
        </button>
        <button
          className={`mode-switch__btn mode-switch__btn--icon ${theme === 'light' ? 'is-active' : ''}`}
          onClick={() => setTheme('light')}
          title="一直用亮色"
          aria-label="一直用亮色"
        >
          <SunIcon />
        </button>
        <button
          className={`mode-switch__btn mode-switch__btn--icon ${theme === 'dark' ? 'is-active' : ''}`}
          onClick={() => setTheme('dark')}
          title="一直用暗色"
          aria-label="一直用暗色"
        >
          <MoonIcon />
        </button>
      </div>

      <button
        className={`btn${mockMode ? ' btn--primary' : ''}`}
        onClick={onToggleMock}
        title="假数据模式：不调真实接口，直接返回构造好的结果，方便先把流程跑通"
      >
        {mockMode ? '假数据·开' : '假数据·关'}
      </button>

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <button className="btn" onClick={onCommand} title="命令面板 (Ctrl/⌘ + K)">
          <SearchIcon /> 命令
        </button>
        <button className="btn" onClick={onAIBuild} title="用 AI 帮你搭流程">
          <SparkIcon /> AI 搭
        </button>
        <button className="btn" onClick={onShare} title="生成一条可分享的链接">
          分享
        </button>
        <button className="btn" onClick={onVersions} title="版本历史">
          版本
        </button>
        <button className="btn" onClick={onExport} title="导出成可运行的代码">
          导出代码
        </button>
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
