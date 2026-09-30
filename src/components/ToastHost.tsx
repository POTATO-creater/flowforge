// ============================================================
// 通知的显示端：挂在界面根部，把 toast() 喊出来的话显示出来
// ============================================================
import { useEffect, useState } from 'react';
import { onToast } from '../lib/toast';

interface Item {
  id: number;
  text: string;
}

let seq = 0;

export function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(
    () =>
      onToast((text) => {
        const id = ++seq;
        setItems((prev) => [...prev.slice(-3), { id, text }]); // 最多同时 4 条
        window.setTimeout(() => {
          setItems((prev) => prev.filter((m) => m.id !== id));
        }, 2600);
      }),
    [],
  );

  if (items.length === 0) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((m) => (
        <div key={m.id} className="toast-inline">
          {m.text}
        </div>
      ))}
    </div>
  );
}
