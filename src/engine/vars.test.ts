import { describe, it, expect } from 'vitest';
import { buildAliases, interpolate, interpolateForJS, setActiveAliases } from './vars';

// 造一张小别名表：一个「让 AI 干活」节点和一个「开始」节点
const aliases = buildAliases([
  { id: 'n1', label: '让 AI 干活', resultName: '结果', rawField: 'content' },
  { id: 'n2', label: '开始', resultName: '内容', rawField: 'text' },
]);

describe('buildAliases', () => {
  it('同时登记中文结果名与英文真实字段名', () => {
    expect(aliases.refs['让 AI 干活.结果']).toEqual({ id: 'n1', field: 'content' });
    expect(aliases.refs['让 AI 干活.content']).toEqual({ id: 'n1', field: 'content' });
    expect(aliases.bare['让 AI 干活']).toEqual({ id: 'n1', field: 'content' });
  });

  it('没有名字的节点不进表', () => {
    const t = buildAliases([{ id: 'x', label: '', resultName: '结果', rawField: 'content' }]);
    expect(Object.keys(t.refs)).toHaveLength(0);
    expect(Object.keys(t.bare)).toHaveLength(0);
  });
});

describe('interpolate', () => {
  const ctx = { n1: { content: '答案是 42' }, n2: { text: '你好' } };

  it('把中文写法换成实际内容', () => {
    expect(interpolate('AI 说：{{让 AI 干活.结果}}', ctx, aliases)).toBe('AI 说：答案是 42');
  });

  it('省略结果名时取该节点的默认产出', () => {
    expect(interpolate('{{开始}}', ctx, aliases)).toBe('你好');
  });

  it('兼容手写英文字段名的老写法', () => {
    expect(interpolate('{{让 AI 干活.content}}', ctx, aliases)).toBe('答案是 42');
  });

  it('容忍大括号里的多余空格', () => {
    expect(interpolate('{{  开始  }}', ctx, aliases)).toBe('你好');
  });

  it('拿不到的引用保持原样，方便用户看出没连上', () => {
    expect(interpolate('{{不存在的节点.结果}}', ctx, aliases)).toBe('{{不存在的节点.结果}}');
  });

  it('节点还没跑（ctx 里没有）时也保留原样', () => {
    expect(interpolate('{{让 AI 干活.结果}}', {}, aliases)).toBe('{{让 AI 干活.结果}}');
  });

  it('字段存在但值是 undefined 时保留原样', () => {
    expect(interpolate('{{让 AI 干活.结果}}', { n1: { other: 1 } }, aliases)).toBe(
      '{{让 AI 干活.结果}}',
    );
  });

  it('循环里的保留名 item 不参与解析', () => {
    expect(interpolate('第 {{item}} 段', ctx, aliases)).toBe('第 {{item}} 段');
  });

  it('空模板原样返回', () => {
    expect(interpolate('', ctx, aliases)).toBe('');
  });

  it('一段话里多个引用一起换', () => {
    expect(interpolate('{{开始}} / {{让 AI 干活.结果}}', ctx, aliases)).toBe('你好 / 答案是 42');
  });

  it('数字和布尔值转成文字', () => {
    const c = { n1: { content: 7 }, n2: { text: true } };
    expect(interpolate('{{让 AI 干活.结果}}-{{开始}}', c, aliases)).toBe('7-true');
  });

  it('对象转成 JSON 文字', () => {
    const c = { n1: { content: { a: 1 } } };
    expect(interpolate('{{让 AI 干活.结果}}', c, aliases)).toBe('{"a":1}');
  });

  it('支持点路径取深层字段', () => {
    const c = { n1: { content: { nested: { deep: '到了' } } } };
    expect(interpolate('{{让 AI 干活.result}}', c, aliases)).toBe('{{让 AI 干活.result}}');
  });
});

describe('全局别名表（setActiveAliases）', () => {
  it('不传 aliases 时用当前生效的那张', () => {
    setActiveAliases(aliases);
    const ctx = { n1: { content: '全局生效' } };
    expect(interpolate('{{让 AI 干活.结果}}', ctx)).toBe('全局生效');
    setActiveAliases(undefined);
  });

  it('清掉后回退到「按 id 直取」的老写法', () => {
    setActiveAliases(undefined);
    const ctx = { n1: { content: '按 id 取的' } };
    // 没有别名表时，「让 AI 干活」会被当成 nodeId，取不到就保留原样
    expect(interpolate('{{让 AI 干活.结果}}', ctx)).toBe('{{让 AI 干活.结果}}');
    // 而直接写 nodeId 是能取到的
    expect(interpolate('{{n1.content}}', ctx)).toBe('按 id 取的');
  });
});

describe('interpolateForJS', () => {
  const ctx = { n1: { content: '带"引号"的文本' }, n2: { text: '你好' } };

  it('把文字包成合法的 JS 字面量（引号被正确转义）', () => {
    const out = interpolateForJS('{{让 AI 干活.结果}} === x', ctx, aliases);
    // 结果要能当代码跑，且值就是原文
    // eslint-disable-next-line no-new-func
    const fn = new Function('x', `return (${out});`);
    expect(fn('带"引号"的文本')).toBe(true);
  });

  it('取不到的引用替换成 undefined 而不是留下花括号', () => {
    expect(interpolateForJS('{{没有这个.结果}}', ctx, aliases)).toBe('undefined');
  });

  it('布尔值以字面量形式给出', () => {
    const c = { n2: { text: false } };
    // eslint-disable-next-line no-new-func
    expect(new Function(`return (${interpolateForJS('{{开始}}', c, aliases)});`)()).toBe(false);
  });

  it('数字以字面量形式给出（不带引号）', () => {
    const c = { n1: { content: 42 } };
    expect(interpolateForJS('{{让 AI 干活.结果}}', c, aliases)).toBe('42');
  });

  it('item 保留名不动', () => {
    expect(interpolateForJS('{{item}} > 3', ctx, aliases)).toBe('{{item}} > 3');
  });
});
