// ============================================================
// 兜底的防崩网：界面哪一块炸了，别让整个页面白屏
//
// React 里任何一块渲染出错，默认会把整棵树掀翻、页面全白。
// 包上这一层之后：出错只显示一张「出了点问题」的卡片，
// 用户可以「再试试」（就地恢复）或「刷新一下」（重新来）。
// ============================================================
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 控制台里留全量信息便于排查，界面上只给人话
    console.error('[FlowForge] 界面渲染出错：', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash__card">
          <h2>页面出了点问题</h2>
          <p className="crash__msg">{this.state.error.message || '不知道哪里坏了，但可以试试恢复。'}</p>
          <p className="crash__tip">别担心：画布内容会自动保存，刷新后还在。</p>
          <div className="crash__btns">
            <button className="btn" onClick={() => this.setState({ error: null })}>
              再试试
            </button>
            <button className="btn btn--primary" onClick={() => window.location.reload()}>
              刷新一下
            </button>
          </div>
        </div>
      </div>
    );
  }
}
