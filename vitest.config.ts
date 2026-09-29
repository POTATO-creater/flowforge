import { defineConfig } from 'vitest/config';

// 测试只覆盖「纯逻辑」——变量插值、文字处理、数据整理、结果预览、分享编码。
// 这些都是输入输出确定的函数，测起来值当，也不会因为界面改版就假报警。
//
// 默认跑在 node 环境（快）。少数函数会用到浏览器自带的 DOM 解析能力
// （比如把网页标签转成文字），这类文件在开头加一行 `@vitest-environment jsdom`
// 单独切到有 DOM 的环境，不给其它测试拖速度。
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
