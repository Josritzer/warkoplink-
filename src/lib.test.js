import { describe, expect, it } from 'vitest';
import {
  FILTER_TOPICS, MAX_POST_LENGTH, POST_TOPICS, authErrorMessage, authorNameFor, canonicalTopic, filterPosts,
  postErrorMessage, validateDisplayName, validateEmail, validatePassword, validatePostBody, validatePostDetails, validateTopic
} from './lib.js';

describe('validateDisplayName', () => {
  it('memangkas spasi dan menerima 2-60 karakter', () => {
    expect(validateDisplayName('  Budi ')).toEqual({ ok: true, value: 'Budi' });
    expect(validateDisplayName('x'.repeat(60)).ok).toBe(true);
  });
  it('menolak nama yang terlalu pendek setelah dipangkas atau terlalu panjang', () => {
    expect(validateDisplayName('a ').ok).toBe(false);
    expect(validateDisplayName('   ').ok).toBe(false);
    expect(validateDisplayName('x'.repeat(61)).ok).toBe(false);
  });
});

describe('validateEmail / validatePassword', () => {
  it('menolak email tidak valid dan menerima yang valid', () => {
    expect(validateEmail('').ok).toBe(false);
    expect(validateEmail('abc').ok).toBe(false);
    expect(validateEmail('a@b').ok).toBe(false);
    expect(validateEmail(' a@b.co ')).toEqual({ ok: true, value: 'a@b.co' });
  });
  it('mensyaratkan kata sandi minimal 6 karakter', () => {
    expect(validatePassword('12345').ok).toBe(false);
    expect(validatePassword('123456').ok).toBe(true);
  });
});

describe('validatePostBody', () => {
  it('menolak pesan kosong atau hanya spasi', () => {
    expect(validatePostBody('').ok).toBe(false);
    expect(validatePostBody('   \n ').ok).toBe(false);
  });
  it('menerima tepat 2000 karakter dan menolak 2001', () => {
    expect(MAX_POST_LENGTH).toBe(2000);
    expect(validatePostBody('a'.repeat(2000)).ok).toBe(true);
    expect(validatePostBody('a'.repeat(2001)).ok).toBe(false);
  });
});

describe('kategori', () => {
  it('hanya menyediakan lima kategori utama final', () => {
    expect(POST_TOPICS).toEqual(['Ngopi Bareng', 'Tanya Warkop', 'Info & Acara', 'Loker', 'Jual Beli & Jasa Lokal']);
    expect(FILTER_TOPICS).toEqual(['Semua', ...POST_TOPICS]);
    expect(validateTopic('Ngopi Bareng')).toBe(true);
    expect(validateTopic('Semua')).toBe(false);
    expect(validateTopic('Lainnya')).toBe(false);
  });
  it('memetakan kategori lama tanpa migrasi data', () => {
    expect(canonicalTopic('Obrolan Umum')).toBe('Ngopi Bareng');
    expect(canonicalTopic('Tanya Jawab')).toBe('Tanya Warkop');
    expect(canonicalTopic('Info Layanan')).toBe('Info & Acara');
    expect(canonicalTopic('Ide & Saran')).toBe('Info & Acara');
    expect(filterPosts([{ topic: 'Tanya Jawab', body: 'wifi' }], 'Tanya Warkop', '')).toHaveLength(1);
  });
  it('memvalidasi detail opsional dan kontak aman', () => {
    expect(validatePostDetails('Loker', { workType: 'Paruh waktu', contact: 'https://example.com' }).ok).toBe(true);
    expect(validatePostDetails('Loker', { contact: 'javascript:alert(1)' }).ok).toBe(false);
    expect(validatePostDetails('kategori asing', {}).ok).toBe(false);
  });
});

describe('authorNameFor', () => {
  it('memakai nama tampilan dan tidak pernah membocorkan email', () => {
    expect(authorNameFor({ displayName: 'Sari', email: 'sari@x.com' })).toBe('Sari');
    expect(authorNameFor({ displayName: null, email: 'rahasia@x.com' })).toBe('Anggota');
    expect(authorNameFor(null)).toBe('Anggota');
  });
});

describe('filterPosts', () => {
  const posts = [
    { body: 'Halo dunia', authorName: 'Sari', topic: 'Obrolan Umum' },
    { body: 'Tanya harga', authorName: 'Budi', topic: 'Tanya Jawab' },
  ];
  it('memfilter berdasarkan topik', () => {
    expect(filterPosts(posts, 'Semua', '')).toHaveLength(2);
    expect(filterPosts(posts, 'Tanya Warkop', '')).toHaveLength(1);
  });
  it('mencari pada isi dan nama penulis tanpa membedakan huruf besar/kecil', () => {
    expect(filterPosts(posts, 'Semua', 'HALO')).toHaveLength(1);
    expect(filterPosts(posts, 'Semua', 'budi')).toHaveLength(1);
    expect(filterPosts(posts, 'Tanya Jawab', 'halo')).toHaveLength(0);
  });
});

describe('pesan error', () => {
  it('memetakan kode Firebase ke pesan Indonesia yang jelas', () => {
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toContain('sudah terdaftar');
    expect(authErrorMessage({ code: 'auth/invalid-email' })).toContain('tidak valid');
    expect(authErrorMessage({ code: 'auth/weak-password' })).toContain('minimal 6');
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toContain('salah');
  });
  it('tidak menampilkan pesan mentah dari server', () => {
    expect(authErrorMessage({ code: 'x', message: 'RAHASIA' })).not.toContain('RAHASIA');
    expect(postErrorMessage({ code: 'permission-denied' })).toContain('aturan keamanan');
    expect(postErrorMessage({ message: 'RAHASIA' })).not.toContain('RAHASIA');
  });
});

describe('postErrorMessage', () => {
  it('tidak menjanjikan jeda 10 detik yang tidak ada di aturan keamanan', () => {
    expect(postErrorMessage({ code: 'permission-denied' })).not.toContain('10 detik');
  });
});
