import { describe, expect, it } from 'vitest';
import { validateImageFile, validateImageFiles } from './imagePolicy.js';
const image = (type = 'image/jpeg', size = 1024) => ({ type, size });

describe('kebijakan foto WarkopLink', () => {
  it('menerima JPG, PNG, dan WebP sampai 2 MB', () => {
    expect(validateImageFile(image('image/jpeg'))).toBe('');
    expect(validateImageFile(image('image/png'))).toBe('');
    expect(validateImageFile(image('image/webp'))).toBe('');
    expect(validateImageFile(image('image/jpeg', 2 * 1024 * 1024))).toBe('');
  });
  it('menolak format non-gambar dan ukuran di atas 2 MB', () => {
    expect(validateImageFile(image('image/gif'))).toMatch(/JPG, PNG, atau WebP/);
    expect(validateImageFile(image('image/jpeg', 2 * 1024 * 1024 + 1))).toMatch(/maksimal 2 MB/);
  });
  it('membatasi jumlah foto dan memvalidasi semua file', () => {
    expect(validateImageFiles(Array.from({ length: 6 }, () => image()))).toBe('Maksimal 5 foto.');
    expect(validateImageFiles([image(), image('image/svg+xml')])).toMatch(/JPG, PNG, atau WebP/);
  });
});
