/**
 * @vitest-environment jsdom
 *
 * 分享链接要读 location 和用浏览器的 base64 能力，所以跑在带 DOM 的环境里。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { encodeWorkflow, decodeWorkflow, buildShareUrl, readShareFromUrl } from './share';
import type { WorkflowJSON } from '../types';

const wf: WorkflowJSON = {
  version: 1,
  name: '测试流程',
  nodes: [
    {
      id: 'n1',
      kind: 'start',
      label: '开始',
      position: { x: 0, y: 0 },
      config: { text: '你好' },
    },
  ],
  edges: [],
};

describe('encodeWorkflow / decodeWorkflow', () => {
  it('编完再解能拿回原样的工作流', () => {
    const round = decodeWorkflow(encodeWorkflow(wf));
    expect(round?.nodes).toHaveLength(1);
    expect(round?.nodes[0].id).toBe('n1');
  });

  it('中文能安全往返（不乱码）', () => {
    const withChinese: WorkflowJSON = {
      ...wf,
      nodes: [{ ...wf.nodes[0], label: '让 AI 干活' }],
    };
    const round = decodeWorkflow(encodeWorkflow(withChinese));
    expect(round?.nodes[0].label).toBe('让 AI 干活');
  });

  it('编出来的串只含网址安全字符', () => {
    expect(encodeWorkflow(wf)).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('串不对时给 null，不抛异常', () => {
    expect(decodeWorkflow('这不是 base64 也不是 json')).toBeNull();
    expect(decodeWorkflow('')).toBeNull();
  });

  it('解出来不是工作流形状（没有 nodes 数组）时也给 null', () => {
    const bad = btoa(JSON.stringify({ hello: 'world' }));
    expect(decodeWorkflow(bad)).toBeNull();
  });
});

describe('buildShareUrl / readShareFromUrl', () => {
  beforeEach(() => {
    // 每个用例都从一条干净的网址开始
    window.history.replaceState(null, '', '/');
  });

  it('生成的链接带上 #wf= 前缀', () => {
    expect(buildShareUrl(wf)).toContain('#wf=');
  });

  it('从链接里能读回同一份工作流', () => {
    const url = buildShareUrl(wf);
    window.history.replaceState(null, '', url);
    const back = readShareFromUrl();
    expect(back?.nodes[0].id).toBe('n1');
  });

  it('网址里没有分享串时给 null', () => {
    window.history.replaceState(null, '', '/some/page');
    expect(readShareFromUrl()).toBeNull();
  });

  it('分享串坏了时给 null，不炸掉页面', () => {
    window.history.replaceState(null, '', '/#wf=坏掉的串');
    expect(readShareFromUrl()).toBeNull();
  });

  it('已有的查询参数会保留在链接里', () => {
    window.history.replaceState(null, '', '/app?x=1');
    expect(buildShareUrl(wf)).toContain('/app?x=1#wf=');
  });
});
