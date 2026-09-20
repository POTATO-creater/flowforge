// 内联 SVG 图标集（避免引入图标库，保持轻量与风格统一）
import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
  style?: CSSProperties;
}

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const PlayIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none" />
  </svg>
);

export const StopIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </svg>
);

export const SaveIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </svg>
);

export const DownloadIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M12 3v12" />
    <path d="M7 11l5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

export const UploadIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M12 21V9" />
    <path d="M7 13l5-5 5 5" />
    <path d="M5 3h14" />
  </svg>
);

export const ImageIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 16l-5-5-7 7" />
  </svg>
);

export const SettingsIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
  </svg>
);

export const TrashIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
);

export const CloseIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const PlusIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const TemplatesIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const SkillIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.3l5-.7z" />
  </svg>
);

export const SparkIcon = ({ size = 16, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);
