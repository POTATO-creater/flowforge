import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  value: number;
  /** 动画时长（毫秒） */
  duration?: number;
  /** 要不要带千分位 */
  group?: boolean;
  suffix?: string;
  className?: string;
}

/**
 * 数字翻滚：从一个值平滑跳到另一个值，跑结果里的「耗时」「字数」时更有「活」的感觉。
 * 尊重系统「减少动态效果」偏好（reduce motion）：直接显示终值，不滚动。
 */
export function CountUp({ value, duration = 600, group = false, suffix = '', className }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>();

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || duration <= 0) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const v = Math.round(from + (to - from) * ease(p));
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [value, duration]);

  const text = group ? display.toLocaleString('en-US') : String(display);
  return (
    <span className={className}>
      {text}
      {suffix}
    </span>
  );
}
