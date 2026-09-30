// ============================================================
// 手机端判断：窄屏就当手机
//
// 不搞「探测 User-Agent」那套（又脆又容易误判），直接看屏幕宽度：
// 窄于 768px 就按手机的路数来（抽屉、大按钮、点选连线）。
// 好处是电脑上把窗口缩窄也能立刻看到手机版长什么样，方便调试。
// ============================================================
import { useEffect, useState } from 'react';

/** 多窄算手机：与 styles/mobile.css 的断点保持一致 */
export const MOBILE_QUERY = '(max-width: 767px)';

/** 当前是不是手机布局。转屏、分屏、缩放窗口时实时更新 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return mobile;
}
