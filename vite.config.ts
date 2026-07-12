import { defineConfig } from 'vite';

export default defineConfig({
  base: '/guandan-master/', // 设置基准路径，适配 GitHub Pages 仓库名部署
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
});
