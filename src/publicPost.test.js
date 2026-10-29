import { describe, expect, it } from 'vitest';
import { isPublicPost } from './lib.js';

describe('penjagaan feed publik', () => {
  it('menyembunyikan hanya dokumen yang eksplisit ditandai non-publik', () => {
    expect(isPublicPost({ id: 'qa-1', body: 'contoh', isTest: true })).toBe(false);
    expect(isPublicPost({ id: 'demo-1', body: 'contoh', visibility: 'demo' })).toBe(false);
    expect(isPublicPost({ id: 'draft-1', body: 'contoh', publicationStatus: 'draft' })).toBe(false);
    expect(isPublicPost({ id: 'fixture-1', body: 'contoh', environment: 'staging' })).toBe(false);
  });
  it('tidak menebak posting sebagai tes berdasarkan isi teks', () => {
    expect(isPublicPost({ id: 'real-1', body: 'tes percobaan' })).toBe(true);
    expect(isPublicPost({ id: 'real-2', body: 'Ngopi sore bareng warga' })).toBe(true);
    expect(isPublicPost({ id: 'legacy-1', body: 'obrolan lama tanpa metadata' })).toBe(true);
  });
  it('menolak nilai kosong dan bukan objek', () => {
    expect(isPublicPost(null)).toBe(false);
    expect(isPublicPost('posting')).toBe(false);
    expect(isPublicPost([])).toBe(false);
  });
});
