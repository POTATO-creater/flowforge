// 图标系统 —— 统一的线性图标集
// 设计约定：24×24 网格、1.5 描边（对齐苹果 SF Symbols 的纤细观感）、圆角端点、
// 光学居中、currentColor 着色。
//  transport 类（播放/停止）与高光点缀（闪烁）用填充，其余一律线性，保证整体一格。
import type { CSSProperties, ReactNode } from 'react';

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

function Svg({
  size = 16,
  strokeWidth = 1.5,
  className,
  style,
  children,
  fill = false,
}: IconProps & { children: ReactNode; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* ===================== transport ===================== */
export const PlayIcon = (p: IconProps) => (
  <Svg {...p} fill>
    <path d="M7.5 5.2c0-.9 1-1.5 1.8-1l9.7 6c.8.5.8 1.6 0 2.1l-9.7 6c-.8.5-1.8-.1-1.8-1V5.2Z" />
  </Svg>
);

export const StopIcon = (p: IconProps) => (
  <Svg {...p} fill>
    <rect x="7" y="7" width="10" height="10" rx="2.6" />
  </Svg>
);

/* ===================== 文件 / IO ===================== */
export const SaveIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 4.5h8v5H20v9.5H5.5z" />
    <path d="M8.5 4.5v5H17" />
    <path d="M8.5 14.5h7v5h-7z" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v10.5" />
    <path d="M8 11l4 4 4-4" />
    <path d="M5 19.5h14" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20V9.5" />
    <path d="M8 13l4-4 4 4" />
    <path d="M5 4.5h14" />
  </Svg>
);

export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.6" />
    <circle cx="9" cy="10" r="1.7" />
    <path d="M4.5 17.6l4.8-4.2 3.2 2.7 2.8-2.4 4.2 3.4" />
  </Svg>
);

/* ===================== 工具 ===================== */
export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.1 5.1l2.1 2.1M16.8 16.8l2.1 2.1M18.9 5.1l-2.1 2.1M7.2 16.8l-2.1 2.1" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 7h15" />
    <path d="M9 7V5h6v2" />
    <path d="M6 7l1 12.4a1.6 1.6 0 0 0 1.6 1.5h7.8a1.6 1.6 0 0 0 1.6-1.5L18 7" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
);

export const TemplatesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
  </Svg>
);

export const SkillIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
    <path d="M4 7.5l8 4.5 8-4.5" />
    <path d="M12 12v9" />
  </Svg>
);

export const SparkIcon = (p: IconProps) => (
  <Svg {...p} fill>
    <path d="M12 3.2c.6 4.8 2.8 7 7.6 7.6-4.8.6-7 2.8-7.6 7.6-.6-4.8-2.8-7-7.6-7.6 4.8-.6 7-2.8 7.6-7.6Z" />
  </Svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="M11 6l-6 6 6 6" />
  </Svg>
);

/* ===================== history ===================== */
export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 15 4 10l5-5" />
    <path d="M4 10h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" />
  </Svg>
);

export const RedoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 15 20 10l-5-5" />
    <path d="M20 10H9.5a5.5 5.5 0 0 0-5.5 5.5 5.5 5.5 0 0 0 5.5 5.5H13" />
  </Svg>
);

/* ===================== 发现性 ===================== */
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.3-4.3" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5.5 15.5 12 9 18.5" />
  </Svg>
);

/* ===================== 主题（亮 / 暗 / 跟随系统）===================== */
/** 太阳：亮色 */
export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2" />
    <path d="M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
  </Svg>
);

/** 月亮：暗色 */
export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" />
  </Svg>
);

/** 半明半暗：跟随系统 */
export const AutoThemeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 3.4a8.6 8.6 0 0 1 0 17.2Z" fill="currentColor" stroke="none" />
  </Svg>
);
