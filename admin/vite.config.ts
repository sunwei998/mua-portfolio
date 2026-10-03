import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/* 生产构建产物挂 Nginx /admin/ 路径下；本地 dev 用 5174 直连 */
export default defineConfig({
  base: '/admin/',
  plugins: [vue()],
  server: {
    port: 5174,
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://127.0.0.1:8082', changeOrigin: true },
      /* 封面/照片素材走站点静态目录（生产由 Nginx 同源提供，dev 转发 8090） */
      '/img': { target: 'http://127.0.0.1:8090', changeOrigin: true },
    },
  },
});
