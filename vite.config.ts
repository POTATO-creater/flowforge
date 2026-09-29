import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 本文件由 Node 执行，发布脚本会注入 PORT 环境变量；工程本身不依赖 Node 类型，这里局部声明即可
declare const process: { env: Record<string, string | undefined> };

// 静态可部署的 SPA。如需把 key 留在服务端（隐藏于浏览器），
// 可启用下方 server.proxy / build 时的 rewrite，将 /llm/* 转发到你的私有网关。
//
// 部署到 GitHub Pages 时项目站点位于 https://<user>.github.io/<repo>/，
// 静态资源必须带上 /<repo>/ 前缀；CI 以 `vite build --mode pages` 注入，
// 本地开发与默认构建均为根路径。
export default defineConfig(({ mode }) => ({
  // 部署到 GitHub Pages 时由 CI 以 --mode pages 注入 /<repo>/ 前缀；本地/默认留空
  base: mode === 'pages' ? '/flowforge/' : '/',
  plugins: [react()],
  server: {
    // 端口跟随发布环境注入的 PORT（本地默认 5173）。
    // 发布为在线应用时脚本会注入 PORT，这里不跟随就会起错端口，探测会判定服务没起来。
    port: Number(process.env.PORT) || 5173,
    // 允许外部访问（发布为在线应用时必须）：
    // host 绑到 0.0.0.0，allowedHosts 放开反代域名，否则 Vite 会报
    // "Blocked request. This host is not allowed."。
    host: '0.0.0.0',
    allowedHosts: true,
    // proxy: {
    //   // 例：将 /llm 转发到真实网关，浏览器只持有 /llm 路径，key 由网关注入
    //   '/llm': {
    //     target: 'https://your-gateway.example.com',
    //     changeOrigin: true,
    //     rewrite: (p) => p.replace(/^\/llm/, ''),
    //   },
    // },
  },
}));
