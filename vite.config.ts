import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 静态可部署的 SPA。如需把 key 留在服务端（隐藏于浏览器），
// 可启用下方 server.proxy / build 时的 rewrite，将 /llm/* 转发到你的私有网关。
export default defineConfig({
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
});
