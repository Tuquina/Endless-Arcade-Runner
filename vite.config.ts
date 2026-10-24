import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative assets: works from any static hosting path
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'] },
});
