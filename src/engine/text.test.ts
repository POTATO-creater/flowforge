/**
 * @vitest-environment jsdom
 *
 * 这个文件要跑在带 DOM 的环境里：HTML / XML 的解析用的是浏览器自带的
 * DOMParser，node 环境里没有，硬测只能测到「报错」而不是「结果对」。
 */
import { describe, it, expect } from 'vitest';
import {
  markdownToHtml,
  htmlToMarkdown,
  htmlToText,
  xmlToObject,
  objectToXml,
  runFindReplace,
  runSlice,
  runDateTime,
  nowFormatted,
  runRandom,
  runEncode,
} from './text';

describe('markdownToHtml', () => {
  it('标题转成 h 标签', () => {
    expect(markdownToHtml('# 大标题')).toContain('<h1>大标题</h1>');
    expect(markdownToHtml('## 小标题')).toContain('<h2>小标题</h2>');
  });

  it('加粗与斜体', () => {
    const out = markdownToHtml('这是 **重点** 和 *轻描*');
    expect(out).toContain('<strong>重点</strong>');
    expect(out).toContain('<em>轻描</em>');
  });

  it('无序列表包成 ul', () => {
    const out = markdownToHtml('- 一\n- 二');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>一</li>');
    expect(out).toContain('</ul>');
  });

  it('行内代码', () => {
    expect(markdownToHtml('用 `npm run dev` 启动')).toContain('<code>npm run dev</code>');
  });

  it('把 HTML 特殊字符转义，不会注入标签', () => {
    const out = markdownToHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('空输入不炸', () => {
    expect(markdownToHtml('')).toBe('');
  });

  it('段落包成 p', () => {
    expect(markdownToHtml('一句话')).toContain('<p>一句话</p>');
  });
});

describe('htmlToText', () => {
  it('剥掉标签只留文字', () => {
    expect(htmlToText('<p>你好 <b>世界</b></p>')).toContain('你好');
    expect(htmlToText('<p>你好 <b>世界</b></p>')).not.toContain('<p>');
  });

  it('去掉 script 和 style 的内容', () => {
    const out = htmlToText('<style>a{}</style><script>x()</script><p>正文</p>');
    expect(out).toContain('正文');
    expect(out).not.toContain('a{}');
    expect(out).not.toContain('x()');
  });
});

describe('htmlToMarkdown', () => {
  it('h 标签转成井号', () => {
    expect(htmlToMarkdown('<h2>标题</h2>')).toContain('## 标题');
  });

  it('链接转成 markdown 写法', () => {
    expect(htmlToMarkdown('<a href="https://a.com">点这里</a>')).toContain('[点这里](https://a.com)');
  });

  it('加粗转成星号', () => {
    expect(htmlToMarkdown('<strong>粗</strong>')).toContain('**粗**');
  });
});

describe('xmlToObject', () => {
  it('把简单 XML 转成对象', () => {
    const out = xmlToObject('<root><name>张三</name></root>') as Record<string, unknown>;
    expect(out).toHaveProperty('name', '张三');
  });

  it('重复的同名标签合成数组', () => {
    const out = xmlToObject('<root><item>a</item><item>b</item></root>') as Record<string, unknown>;
    expect(out.item).toEqual(['a', 'b']);
  });
});

describe('objectToXml', () => {
  it('把对象转成 XML', () => {
    const out = objectToXml({ name: '张三' }, 'root');
    expect(out).toContain('<root>');
    expect(out).toContain('<name>张三</name>');
    expect(out).toContain('</root>');
  });

  it('数组展开成重复标签', () => {
    const out = objectToXml({ item: ['a', 'b'] }, 'root');
    expect(out.match(/<item>/g)).toHaveLength(2);
  });
});

describe('runFindReplace', () => {
  it('普通查找替换，替换全部', () => {
    const r = runFindReplace('a-b-c-d', { find: '-', replace: '+', regex: false, all: true, ignoreCase: false });
    expect(r.result).toBe('a+b+c+d');
    expect(r.count).toBe(3);
  });

  it('只换第一个', () => {
    const r = runFindReplace('a-b-c', { find: '-', replace: '+', regex: false, all: false, ignoreCase: false });
    expect(r.result).toBe('a+b-c');
    expect(r.count).toBe(1);
  });

  it('忽略大小写', () => {
    const r = runFindReplace('Ab-aB', { find: 'ab', replace: 'x', regex: false, all: true, ignoreCase: true });
    expect(r.result).toBe('x-x');
  });

  it('找的内容为空时原样返回', () => {
    const r = runFindReplace('abc', { find: '', replace: 'x', regex: false, all: true, ignoreCase: false });
    expect(r.result).toBe('abc');
    expect(r.count).toBe(0);
  });

  it('普通模式下特殊符号按字面处理（不会被当正则）', () => {
    const r = runFindReplace('a.b', { find: '.', replace: '-', regex: false, all: true, ignoreCase: false });
    expect(r.result).toBe('a-b');
  });

  it('正则模式下按正则处理', () => {
    const r = runFindReplace('a1b2', { find: '\\d', replace: '#', regex: true, all: true, ignoreCase: false });
    expect(r.result).toBe('a#b#');
  });

  it('正则写坏时给人话报错', () => {
    expect(() =>
      runFindReplace('a', { find: '[', replace: 'x', regex: true, all: true, ignoreCase: false }),
    ).toThrow(/特殊符号/);
  });
});

describe('runSlice', () => {
  it('按位置切一段', () => {
    expect(runSlice('abcdef', { from: 1, to: 3, bySeparator: false, separator: '', index: 0 })).toBe('bc');
  });

  it('只给起点就切到结尾', () => {
    expect(runSlice('abcdef', { from: 3, to: 0, bySeparator: false, separator: '', index: 0 })).toBe('def');
  });

  it('按分隔符取第几段', () => {
    expect(runSlice('a\nb\nc', { from: 0, to: 0, bySeparator: true, separator: '\n', index: 2 })).toBe('c');
  });

  it('段号超出范围时给人话报错', () => {
    expect(() =>
      runSlice('a\nb', { from: 0, to: 0, bySeparator: true, separator: '\n', index: 9 }),
    ).toThrow(/一共 2 段/);
  });
});

describe('runDateTime', () => {
  it('按格式输出指定日期', () => {
    const out = runDateTime('2026-01-31 15:30:00', {
      op: 'format',
      inputFormat: 'auto',
      format: 'YYYY/MM/DD',
      amount: 0,
      unit: 'day',
      target: '',
    });
    expect(out).toBe('2026/01/31');
  });

  it('算星期几', () => {
    const out = runDateTime('2026-01-31', {
      op: 'weekday',
      inputFormat: 'auto',
      format: '',
      amount: 0,
      unit: 'day',
      target: '',
    });
    expect(out).toBe('星期六');
  });

  it('往后推几天', () => {
    const out = runDateTime('2026-01-31', {
      op: 'add',
      inputFormat: 'auto',
      format: 'YYYY-MM-DD',
      amount: 1,
      unit: 'day',
      target: '',
    });
    expect(out).toBe('2026-02-01');
  });

  it('算两个日期差几天', () => {
    const out = runDateTime('2026-01-01', {
      op: 'diff',
      inputFormat: 'auto',
      format: '',
      amount: 0,
      unit: 'day',
      target: '2026-01-11',
    });
    expect(out).toBe('10');
  });

  it('10 位时间戳按秒算', () => {
    const out = runDateTime('0', {
      op: 'format',
      inputFormat: 'timestamp',
      format: 'YYYY',
      amount: 0,
      unit: 'day',
      target: '',
    });
    // 时间是本地时区，只看它没报错且是个合理年份
    expect(Number(out)).toBeGreaterThan(1969);
  });

  it('认不出的日期给人话报错', () => {
    expect(() =>
      runDateTime('随便写的', {
        op: 'format',
        inputFormat: 'auto',
        format: '',
        amount: 0,
        unit: 'day',
        target: '',
      }),
    ).toThrow(/读不出这是哪一天/);
  });

  it('输入为空时提示先接上内容', () => {
    expect(() =>
      runDateTime('', {
        op: 'format',
        inputFormat: 'auto',
        format: '',
        amount: 0,
        unit: 'day',
        target: '',
      }),
    ).toThrow(/需要有内容/);
  });
});

describe('nowFormatted', () => {
  it('按格式给出当前时间', () => {
    expect(nowFormatted('YYYY')).toMatch(/^\d{4}$/);
  });

  it('默认格式给到秒', () => {
    expect(nowFormatted('')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('runRandom', () => {
  it('按要求的长度生成', () => {
    expect(runRandom(8, 'alnum')).toHaveLength(8);
  });

  it('十六进制只含 0-9a-f', () => {
    expect(runRandom(64, 'hex')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('纯数字只含 0-9', () => {
    expect(runRandom(16, 'number')).toMatch(/^\d{16}$/);
  });

  it('长度有个合理上限', () => {
    expect(runRandom(99999, 'hex').length).toBeLessThanOrEqual(4096);
  });

  it('两次生成结果不同', () => {
    expect(runRandom(32, 'alnum')).not.toBe(runRandom(32, 'alnum'));
  });
});

describe('runEncode', () => {
  it('base64 编码后能解回原文（中文不乱码）', () => {
    const enc = runEncode('你好，世界', { op: 'b64enc' });
    expect(runEncode(enc, { op: 'b64dec' })).toBe('你好，世界');
  });

  it('网址编码与解码', () => {
    const enc = runEncode('a b&c', { op: 'urlenc' });
    expect(runEncode(enc, { op: 'urldec' })).toBe('a b&c');
  });

  it('网页写法编码把尖括号转义', () => {
    expect(runEncode('<b>', { op: 'htmlenc' })).toBe('&lt;b&gt;');
  });
});
