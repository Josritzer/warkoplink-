import { defineConfig } from 'vitest/config';

// Tes Firestore Rules: dijalankan di dalam emulator (lihat script "test:rules" dan CI).
export default defineConfig({
  test: {
    environment: 'node',
    // Semua file memakai projectId emulator yang sama dan clearFirestore();
    // jalankan berurutan agar teardown file lain tidak menghapus data tes aktif.
    fileParallelism: false,
    include: ['tests/rules/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
