import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
