import { describe, expect, it } from 'vitest';
import { isPublicPost } from './lib.js';

describe('penjagaan feed publik', () => {
  it('menyembunyikan dokumen yang secara eksplisit ditandai sebagai QA/demo', () => {
    expect(isPublicPost({ id: 'qa-1', body: 'contoh', isTest: true })).toBe(false);
    expect(isPublicPost({ id: 'demo-1', body: 'contoh', visibility: 'demo' })).toBe(false);
    expect(isPublicPost({ id: 'draft-1', body: 'contoh', publicationStatus: 'draft' })).toBe(false);
    expect(isPublicPost({ id: 'fixture-1', body: 'contoh', environment: 'staging' })).toBe(false);
  });

  it('tidak menebak bahwa teks posting adalah QA tanpa penanda eksplisit', () => {
    expect(isPublicPost({ id: 'legit-1', body: 'tes percobaan' })).toBe(true);
    expect(isPublicPost({ id: 'real-1', body: 'Ngopi sore bareng warga' })).toBe(true);
  });

  it('menolak nilai kosong atau bukan objek sebagai data feed', () => {
    expect(isPublicPost(null)).toBe(false);
    expect(isPublicPost('posting')).toBe(false);
  });
});
