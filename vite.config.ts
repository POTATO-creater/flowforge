import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
    port: 5173,
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
