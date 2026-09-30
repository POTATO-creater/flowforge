import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from './markdown';

/** 渲染成 HTML 字符串，方便断言 */
function md(src: string): string {
  return renderToStaticMarkup(renderMarkdown(src) as never);
}

describe('renderMarkdown：块级', () => {
  it('普通段落', () => {
    expect(md('今天天气不错')).toBe('<p class="md__p">今天天气不错</p>');
  });

  it('标题压两级渲染（# 不会顶出特大字）', () => {
    expect(md('# 大标题')).toContain('<h3 class="md__h">大标题</h3>');
    expect(md('## 小标题')).toContain('<h4 class="md__h">小标题</h4>');
    expect(md('#### 更小')).toContain('<h6 class="md__h">更小</h6>');
  });

  it('代码块原样保留（不做行内解析）', () => {
    const html = md('```\n**这不是粗体**\n```');
    expect(html).toContain('<pre');
    expect(html).toContain('**这不是粗体**');
    expect(html).not.toContain('<strong>');
  });

  it('无序列表 / 有序列表', () => {
    expect(md('- 苹果\n- 香蕉')).toContain('<ul class="md__list"><li>苹果</li><li>香蕉</li></ul>');
    expect(md('1. 第一\n2. 第二')).toContain('<ol class="md__list"><li>第一</li><li>第二</li></ol>');
  });

  it('引用块', () => {
    expect(md('> 记住这句话')).toContain('<blockquote class="md__quote">');
    expect(md('> 记住这句话')).toContain('记住这句话');
  });

  it('分隔线', () => {
    expect(md('上\n\n---\n\n下')).toContain('<hr class="md__hr"/>');
  });

  it('表格：表头加表体', () => {
    const html = md('| 名字 | 分数 |\n|---|---|\n| 小明 | 98 |');
    expect(html).toContain('<table class="md__table">');
    expect(html).toContain('<th>名字</th>');
    expect(html).toContain('<td>小明</td>');
  });
});

describe('renderMarkdown：行内', () => {
  it('粗体 / 斜体 / 行内代码', () => {
    expect(md('**加粗**的字')).toContain('<strong>加粗</strong>的字');
    expect(md('有点*强调*的意思')).toContain('<em>强调</em>');
    expect(md('变量 `x` 是数字')).toContain('<code class="md__code">x</code>');
  });

  it('链接：文字与网址', () => {
    expect(md('[点这里](https://example.com)')).toContain(
      '<a href="https://example.com" target="_blank" rel="noreferrer">点这里</a>',
    );
  });

  it('裸网址自动变成可点的链接', () => {
    expect(md('看 https://example.com/a?q=1 就知道')).toContain(
      '<a href="https://example.com/a?q=1" target="_blank" rel="noreferrer">https://example.com/a?q=1</a>',
    );
  });

  it('段落内换行保留', () => {
    expect(md('第一行\n第二行')).toContain('<br/>');
  });
});

describe('renderMarkdown：安全（从根上防注入）', () => {
  it('HTML 标签只当文字显示，不会被执行', () => {
    const html = md('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('伪协议链接不会被渲染成可点的链接', () => {
    const html = md('[点我](javascript:alert(1))');
    // javascript: 不在允许的协议里，整段按普通文字处理
    expect(html).not.toContain('href="javascript:');
  });

  it('img 标签也被当文字', () => {
    const html = md('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('空内容返回空', () => {
    expect(renderMarkdown('')).toBeNull();
    expect(renderMarkdown(undefined as unknown as string)).toBeNull();
  });
});
