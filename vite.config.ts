import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/guandan-master/', // 设置基准路径，适配 GitHub Pages 仓库名部署
  server: {
    host: '127.0.0.1',
    port: 3000,
    open: false
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  },
  test: {
    exclude: [
      'node_modules',
      'dist',
      '.git',
      '.cache',
      'tests/e2e'
    ]
  }
});


