import { describe, it, expect } from 'vitest';
import {
  toList,
  parseLooseObject,
  runFilter,
  runSort,
  runLimit,
  runRemoveDuplicates,
  runSplitOut,
  runAggregate,
  runSummarize,
  runPickFields,
  runRenameKeys,
  renderObject,
} from './datasets';

describe('toList', () => {
  it('数组原样逐项转文字', () => {
    expect(toList(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('数字与布尔转字符串', () => {
    expect(toList([1, true])).toEqual(['1', 'true']);
  });

  it('一段文字按行切成条目并丢掉空行', () => {
    expect(toList('a\n\nb\n  c  \n')).toEqual(['a', 'b', 'c']);
  });

  it('兼容 Windows 换行', () => {
    expect(toList('a\r\nb')).toEqual(['a', 'b']);
  });

  it('null / undefined 给空数组', () => {
    expect(toList(null)).toEqual([]);
    expect(toList(undefined)).toEqual([]);
  });

  it('单个数字包成一项', () => {
    expect(toList(5)).toEqual(['5']);
  });

  it('对象转 JSON 包成一项', () => {
    expect(toList({ a: 1 })).toEqual(['{"a":1}']);
  });

  it('数组里的对象转 JSON', () => {
    expect(toList([{ a: 1 }])).toEqual(['{"a":1}']);
  });
});

describe('parseLooseObject', () => {
  it('对象直接转成名值都是文字的形态', () => {
    expect(parseLooseObject({ a: '1', b: 2 })).toEqual({ a: '1', b: '2' });
  });

  it('按「字段名: 值」解析每一行', () => {
    expect(parseLooseObject('名字: 张三\n城市: 北京')).toEqual({ 名字: '张三', 城市: '北京' });
  });

  it('认中文全角冒号', () => {
    expect(parseLooseObject('名字：李四')).toEqual({ 名字: '李四' });
  });

  it('没有冒号的行归到「内容」字段', () => {
    expect(parseLooseObject('随便一段话')).toEqual({ 内容: '随便一段话' });
  });

  it('空行不产生字段', () => {
    expect(parseLooseObject('\n\n')).toEqual({});
  });
});

describe('runFilter', () => {
  const list = ['苹果', '香蕉', '苹果派'];

  it('含有', () => {
    expect(runFilter(list, { keyword: '苹果', mode: 'contains' })).toEqual(['苹果', '苹果派']);
  });

  it('不含', () => {
    expect(runFilter(list, { keyword: '苹果', mode: 'notContains' })).toEqual(['香蕉']);
  });

  it('以它开头', () => {
    expect(runFilter(list, { keyword: '苹果', mode: 'startsWith' })).toEqual(['苹果', '苹果派']);
  });

  it('以它结尾', () => {
    expect(runFilter(list, { keyword: '派', mode: 'endsWith' })).toEqual(['苹果派']);
  });

  it('关键词为空时不过滤', () => {
    expect(runFilter(list, { keyword: '', mode: 'contains' })).toEqual(list);
  });
});

describe('runSort', () => {
  it('按文字升序', () => {
    expect(runSort(['c', 'a', 'b'], { by: 'text', order: 'asc' })).toEqual(['a', 'b', 'c']);
  });

  it('按文字降序', () => {
    expect(runSort(['c', 'a', 'b'], { by: 'text', order: 'desc' })).toEqual(['c', 'b', 'a']);
  });

  it('按长短排', () => {
    expect(runSort(['aaa', 'a', 'aa'], { by: 'length', order: 'asc' })).toEqual(['a', 'aa', 'aaa']);
  });

  it('按数字排（能从文字里抠出数字）', () => {
    expect(runSort(['10分', '2分', '33分'], { by: 'number', order: 'asc' })).toEqual([
      '2分',
      '10分',
      '33分',
    ]);
  });

  it('不改动传入的原数组', () => {
    const src = ['c', 'a'];
    runSort(src, { by: 'text', order: 'asc' });
    expect(src).toEqual(['c', 'a']);
  });
});

describe('runLimit', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('取前几个', () => {
    expect(runLimit(list, { count: 2, from: 'head' })).toEqual(['a', 'b']);
  });

  it('取后几个', () => {
    expect(runLimit(list, { count: 2, from: 'tail' })).toEqual(['c', 'd']);
  });

  it('要 0 条时给全部（0 被当成「不限」）', () => {
    expect(runLimit(list, { count: 0, from: 'head' })).toEqual(list);
  });

  it('要的比有的多时给全部', () => {
    expect(runLimit(list, { count: 99, from: 'head' })).toEqual(list);
  });
});

describe('runRemoveDuplicates', () => {
  it('去掉重复，保留第一次出现的位置', () => {
    expect(runRemoveDuplicates(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('忽略两侧空格判重', () => {
    expect(runRemoveDuplicates(['a', ' a '])).toEqual(['a']);
  });

  it('原样保留首次出现的那条（含空格）', () => {
    expect(runRemoveDuplicates([' a ', 'a'])).toEqual([' a ']);
  });
});

describe('runSplitOut', () => {
  it('按分隔符切开', () => {
    expect(runSplitOut('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });

  it('切完丢掉空片段', () => {
    expect(runSplitOut('a,,b', ',')).toEqual(['a', 'b']);
  });

  it('分隔符为空时退回按行切', () => {
    expect(runSplitOut('a\nb', '')).toEqual(['a', 'b']);
  });
});

describe('runAggregate', () => {
  it('按分隔符连起来', () => {
    expect(runAggregate(['a', 'b', 'c'], ' / ')).toBe('a / b / c');
  });

  it('没有条目时给空串', () => {
    expect(runAggregate([], ',')).toBe('');
  });
});

describe('runSummarize', () => {
  it('数一数有几条', () => {
    expect(runSummarize(['a', 'b'], { op: 'count', separator: '' }).result).toBe('2');
  });

  it('加起来是多少', () => {
    expect(runSummarize(['10', '20', '30'], { op: 'sum', separator: '' }).result).toBe('60');
  });

  it('平均是多少', () => {
    expect(runSummarize(['10', '20'], { op: 'average', separator: '' }).result).toBe('15');
  });

  it('最大是多少', () => {
    expect(runSummarize(['3', '9', '5'], { op: 'max', separator: '' }).result).toBe('9');
  });

  it('最小是多少', () => {
    expect(runSummarize(['3', '9', '5'], { op: 'min', separator: '' }).result).toBe('3');
  });

  it('从文字里抠数字来算', () => {
    expect(runSummarize(['售价 12 元', '售价 8 元'], { op: 'sum', separator: '' }).result).toBe('20');
  });

  it('不重复的有几条', () => {
    expect(runSummarize(['a', 'a', 'b'], { op: 'unique', separator: '' }).result).toBe('2');
  });

  it('连成一段', () => {
    expect(runSummarize(['a', 'b'], { op: 'join', separator: '-' }).result).toBe('a-b');
  });

  it('小数不留长尾巴', () => {
    expect(runSummarize(['1', '2', '2'], { op: 'average', separator: '' }).result).toBe('1.6667');
  });
});

describe('runPickFields', () => {
  const src = { 名字: '张三', 城市: '北京' };

  it('只挑点名的字段', () => {
    expect(runPickFields(src, { fields: '名字', missing: 'empty' })).toEqual({ 名字: '张三' });
  });

  it('支持逗号分隔多个字段', () => {
    expect(runPickFields(src, { fields: '名字, 城市', missing: 'empty' })).toEqual(src);
  });

  it('认中文逗号', () => {
    expect(runPickFields(src, { fields: '名字，城市', missing: 'empty' })).toEqual(src);
  });

  it('字段不存在时按设置补空', () => {
    expect(runPickFields(src, { fields: '电话', missing: 'empty' })).toEqual({ 电话: '' });
  });

  it('字段不存在时按设置跳过', () => {
    expect(runPickFields(src, { fields: '电话', missing: 'skip' })).toEqual({});
  });
});

describe('runRenameKeys', () => {
  it('按「旧名=新名」改名', () => {
    expect(runRenameKeys({ a: '1' }, 'a=甲')).toEqual({ 甲: '1' });
  });

  it('没写进映射的字段名保持不变', () => {
    expect(runRenameKeys({ a: '1', b: '2' }, 'a=甲')).toEqual({ 甲: '1', b: '2' });
  });

  it('认中文冒号的分隔写法', () => {
    expect(runRenameKeys({ a: '1' }, 'a：甲')).toEqual({ 甲: '1' });
  });

  it('无分隔符的行被忽略', () => {
    expect(runRenameKeys({ a: '1' }, '这行没用')).toEqual({ a: '1' });
  });
});

describe('renderObject', () => {
  it('渲染成「字段：值」的多行文字', () => {
    expect(renderObject({ 名字: '张三', 城市: '北京' })).toBe('名字：张三\n城市：北京');
  });

  it('空对象给空串', () => {
    expect(renderObject({})).toBe('');
  });
});
