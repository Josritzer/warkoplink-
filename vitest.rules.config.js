import { defineConfig } from 'vitest/config';

// Tes Firestore Rules: dijalankan di dalam emulator (lihat script "test:rules" dan CI).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
