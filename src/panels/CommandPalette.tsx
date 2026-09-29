import { useEffect, useMemo, useRef, useState } from 'react';
import type { NodeKind } from '../types';
import { NODE_LIST } from '../nodeMeta';
import {
  PlayIcon,
  StopIcon,
  UndoIcon,
  RedoIcon,
  TemplatesIcon,
  SettingsIcon,
  DownloadIcon,
  TrashIcon,
  SearchIcon,
  SparkIcon,
} from '../lib/icons';

interface CommandPaletteProps {
  running: boolean;
  onClose: () => void;
  onRun: () => void;
  onStop: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onOpenTemplates: () => void;
  onOpenSettings: () => void;
  onExportJson: () => void;
  onAddNode: (kind: NodeKind) => void;
  onShare: () => void;
  onVersions: () => void;
  onExportCode: () => void;
  onAIBuild: () => void;
  onSaveVersion: () => void;
}

interface Item {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: () => void;
  disabled?: boolean;
  /** 节点类目：在图标位用色块 + 字代替 */
  badge?: { text: string; color: string };
}

export function CommandPalette(props: CommandPaletteProps) {
  const { onClose, running } = props;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 操作类命令
  const actions: Item[] = useMemo(
    () => [
      {
        id: 'run',
        label: '跑一遍',
        hint: '运行整个工作流',
        icon: <PlayIcon size={18} />,
        run: props.onRun,
        disabled: running,
      },
      {
        id: 'stop',
        label: '停下',
        hint: '停止正在跑的流程',
        icon: <StopIcon size={18} />,
        run: props.onStop,
        disabled: !running,
      },
      { id: 'undo', label: '撤销', hint: 'Ctrl / ⌘ + Z', icon: <UndoIcon size={18} />, run: props.onUndo },
      {
        id: 'redo',
        label: '重做',
        hint: 'Ctrl / ⌘ + Shift + Z',
        icon: <RedoIcon size={18} />,
        run: props.onRedo,
      },
      {
        id: 'templates',
        label: '现成的例子',
        hint: '从模板库挑一个开始',
        icon: <TemplatesIcon size={18} />,
        run: props.onOpenTemplates,
      },
      {
        id: 'settings',
        label: 'AI 设置',
        hint: '看现在用的是哪个 / 换成自己的',
        icon: <SettingsIcon size={18} />,
        run: props.onOpenSettings,
      },
      {
        id: 'export',
        label: '存成文件',
        hint: '导出工作流 JSON',
        icon: <DownloadIcon size={18} />,
        run: props.onExportJson,
      },
      {
        id: 'clear',
        label: '清空画布',
        hint: '移除全部节点',
        icon: <TrashIcon size={18} />,
        run: props.onClear,
      },
      {
        id: 'aibuild',
        label: '用 AI 搭流程',
        hint: '描述想法，让 AI 拆成节点',
        icon: <SparkIcon size={18} />,
        run: props.onAIBuild,
      },
      {
        id: 'share',
        label: '分享链接',
        hint: '生成一条可发给别人的链接',
        icon: <DownloadIcon size={18} />,
        run: props.onShare,
      },
      {
        id: 'versions',
        label: '版本历史',
        hint: '存 / 恢复检查点',
        icon: <TemplatesIcon size={18} />,
        run: props.onVersions,
      },
      {
        id: 'exportcode',
        label: '导出成代码',
        hint: '生成可运行的 JavaScript',
        icon: <SettingsIcon size={18} />,
        run: props.onExportCode,
      },
      {
        id: 'saveversion',
        label: '存为版本',
        hint: '把当前画布存成检查点',
        icon: <DownloadIcon size={18} />,
        run: props.onSaveVersion,
      },
    ],
    [props],
  );

  // 加节点类命令
  const nodeItems: Item[] = useMemo(
    () =>
      NODE_LIST.map((m) => ({
        id: `node:${m.kind}`,
        label: m.name,
        hint: m.desc ?? '',
        icon: null,
        badge: { text: m.badge, color: `var(${m.colorVar})` },
        run: () => props.onAddNode(m.kind as NodeKind),
      })),
    [props],
  );

  const q = query.trim().toLowerCase();
  const filteredActions = q
    ? actions.filter((a) => `${a.label}${a.hint}`.toLowerCase().includes(q))
    : actions;
  const filteredNodes = q
    ? nodeItems.filter((n) => `${n.label}${n.hint}`.toLowerCase().includes(q))
    : nodeItems;
  const visible: Item[] = [...filteredActions, ...filteredNodes];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setActive(0);
  }, [q]);
  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function execute(item: Item | undefined) {
    if (!item || item.disabled) return;
    item.run();
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      execute(visible[active]);
    }
  }

  let idx = -1;
  const renderRow = (item: Item) => {
    idx += 1;
    const i = idx;
    return (
      <button
        key={item.id}
        ref={(el) => (rowRefs.current[i] = el)}
        className={`cmd-row${i === active ? ' is-active' : ''}${item.disabled ? ' is-disabled' : ''}`}
        onMouseMove={() => setActive(i)}
        onClick={() => execute(item)}
        type="button"
      >
        <span className="cmd-row__icon">
          {item.badge ? (
            <span className="palette__badge" style={{ background: item.badge.color }}>
              {item.badge.text}
            </span>
          ) : (
            item.icon
          )}
        </span>
        <span className="cmd-row__text">
          <span className="cmd-row__label">{item.label}</span>
          {item.hint && <span className="cmd-row__hint">{item.hint}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="cmd-backdrop" onMouseDown={onClose}>
      <div className="cmd" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="命令面板">
        <div className="cmd__search">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            className="cmd__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="输入命令，或搜一个节点…"
            aria-label="命令搜索"
          />
          <kbd className="cmd__kbd">esc</kbd>
        </div>

        <div className="cmd__list">
          {filteredActions.length > 0 && <div className="cmd__group">操作</div>}
          {filteredActions.map(renderRow)}
          {filteredNodes.length > 0 && <div className="cmd__group">加节点</div>}
          {filteredNodes.map(renderRow)}

          {visible.length === 0 && <div className="cmd__empty">没有匹配的结果</div>}
        </div>

        <div className="cmd__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 执行</span>
          <span><kbd>esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
