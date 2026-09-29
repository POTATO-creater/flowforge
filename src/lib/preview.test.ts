import { describe, it, expect } from 'vitest';
import { readableOutput, outputImage, clip } from './preview';

describe('readableOutput', () => {
  it('没有结果时给空串', () => {
    expect(readableOutput(undefined)).toBe('');
    expect(readableOutput(null as unknown as Record<string, unknown>)).toBe('');
  });

  it('AI 类节点取 content 字段', () => {
    expect(readableOutput({ content: '这是回答' })).toBe('这是回答');
  });

  it('抓网页取 body 字段', () => {
    expect(readableOutput({ body: '正文' })).toBe('正文');
  });

  it('判断节点把真假翻成「成立 / 不成立」', () => {
    expect(readableOutput({ branch: true })).toBe('成立');
    expect(readableOutput({ branch: false })).toBe('不成立');
  });

  it('判断结果若是文字 "true" 也认', () => {
    expect(readableOutput({ branch: 'true' })).toBe('成立');
    expect(readableOutput({ branch: 'false' })).toBe('不成立');
  });

  it('出图表节点只报个数，不铺长网址', () => {
    const out = { image: 'https://quickchart.io/chart?w=600&h=360&c=xxx', count: 3 };
    expect(readableOutput(out)).toBe('画好了 3 组数据的图，图就在卡片上');
  });

  it('列表结果按行拼起来', () => {
    expect(readableOutput({ result: ['a', 'b'] })).toBe('a\nb');
  });

  it('对象结果转成缩进 JSON', () => {
    expect(readableOutput({ result: { a: 1 } })).toBe('{\n  "a": 1\n}');
  });

  it('数字转文字', () => {
    expect(readableOutput({ result: 42 })).toBe('42');
  });

  it('都不匹配时兜底取第一个字符串值', () => {
    expect(readableOutput({ odd: '兜底取到这个' })).toBe('兜底取到这个');
  });

  it('兜底时跳过图片网址（它太长，要单独贴图）', () => {
    expect(readableOutput({ link: 'https://a.com/x.png' })).toBe('');
  });
});

describe('outputImage', () => {
  it('没有结果时给空串', () => {
    expect(outputImage(undefined)).toBe('');
  });

  it('认普通的图片网址', () => {
    expect(outputImage({ image: 'https://a.com/x.png' })).toBe('https://a.com/x.png');
  });

  it('认内嵌的 base64 图片', () => {
    const uri = 'data:image/png;base64,iVBORw0KGgo=';
    expect(outputImage({ image: uri })).toBe(uri);
  });

  it('显示面板看到的图也认（shown 字段）', () => {
    expect(outputImage({ shown: 'https://a.com/y.png' })).toBe('https://a.com/y.png');
  });

  it('不是图片的东西不认', () => {
    expect(outputImage({ image: '这段不是图' })).toBe('');
    expect(outputImage({ image: 'ftp://a.com/x' })).toBe('');
  });
});

describe('clip', () => {
  it('没超长就原样给', () => {
    expect(clip('短文字', 10)).toEqual({ text: '短文字', clipped: false });
  });

  it('超长就截断并标记', () => {
    expect(clip('0123456789abc', 10)).toEqual({ text: '0123456789', clipped: true });
  });

  it('正好等于上限时不算截断', () => {
    expect(clip('0123456789', 10)).toEqual({ text: '0123456789', clipped: false });
  });

  it('默认上限是 160 个字', () => {
    expect(clip('x'.repeat(161)).clipped).toBe(true);
    expect(clip('x'.repeat(160)).clipped).toBe(false);
  });
});
