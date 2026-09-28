import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 允许外部访问（发布为在线应用时必须）：
    // host 绑到 0.0.0.0，allowedHosts 放开反代域名，否则 Vite 会报
    // "Blocked request. This host is not allowed."。
    host: '0.0.0.0',
    allowedHosts: true,
    // 如果将来要隐藏密钥，可以用 server.proxy 把 /llm 转发到私有网关：
    // proxy: { '/llm': { target: 'https://your-gateway', changeOrigin: true } }
  },
});
