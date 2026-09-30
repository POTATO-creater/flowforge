// ============================================================
// 点选连线：手机上「拖小圆点」太难按中，改成点两下
//
// 电脑上连线是从一个节点的圆点按住拖到另一个节点的圆点；
// 手指太粗，这一套在手机上基本没法用。
// 所以手机上改成：从圆点拖出去（随便拖到哪松手），屏幕下方会
// 弹出一个「候选名单」，点一下要连给谁，就连上了。
// ============================================================
import { useMemo } from 'react';
import type { Node } from '@xyflow/react';
import { NODE_LIST, NODE_GROUPS } from '../nodeMeta';
import type { FlowNodeData } from '../types';

/** 连线的发起方：哪个节点、从哪个方向（拖出 / 接入）、哪个出口 */
export interface ConnectPickSource {
  nodeId: string;
  handleType: 'source' | 'target';
  handleId?: string | null;
}

interface ConnectPickerProps {
  from: ConnectPickSource;
  /** 画布上的全部节点（候选名单从这里出） */
  nodes: Node<FlowNodeData>[];
  onPick: (otherId: string) => void;
  onClose: () => void;
}

export function ConnectPicker({ from, nodes, onPick, onClose }: ConnectPickerProps) {
  const fromNode = nodes.find((n) => n.id === from.nodeId);

  const groups = useMemo(() => {
    const metaOf = (kind: string) => NODE_LIST.find((m) => m.kind === kind);
    return NODE_GROUPS.map((g) => ({
      title: g.title,
      items: nodes
        .filter((n) => n.id !== from.nodeId)
        .filter((n) => metaOf((n.data as FlowNodeData).kind)?.group === g.key),
    })).filter((g) => g.items.length > 0);
  }, [nodes, from.nodeId]);

  return (
    <>
      {/* 点空白处关掉（比抽屉的遮罩低一层，让浮层压在上面） */}
      <div className="drawer-backdrop" style={{ zIndex: 44 }} onClick={onClose} />
      <div className="connect-picker" role="dialog" aria-label="选择连线对象">
        <div className="connect-picker__hint">
          {from.handleType === 'source'
            ? `把「${fromNode?.data.label ?? ''}」的结果交给谁？点一下就连上`
            : `给「${fromNode?.data.label ?? ''}」找一个上游节点，点一下就连上`}
        </div>
        {groups.map((g) => (
          <div key={g.title}>
            <div className="connect-picker__group">{g.title}</div>
            {g.items.map((n) => {
              const kind = (n.data as FlowNodeData).kind;
              const m = NODE_LIST.find((x) => x.kind === kind);
              return (
                <button key={n.id} className="connect-picker__item" onClick={() => onPick(n.id)}>
                  <span
                    className="connect-picker__dot"
                    style={{ background: `var(${m?.colorVar ?? '--st-idle'})` }}
                  />
                  <span>{n.data.label}</span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {m?.name}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
