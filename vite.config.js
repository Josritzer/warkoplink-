import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Dibaca oleh Vitest; tidak memengaruhi build produksi.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    // CI runner memory is limited; serialize test files and fail hung tests promptly.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
