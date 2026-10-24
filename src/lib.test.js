import { describe, expect, it } from 'vitest';
import {
  FILTER_TOPICS, MAX_POST_LENGTH, POST_TOPICS, REPORT_REASONS, authErrorMessage, authorNameFor,
  deleteErrorMessage, filterPosts, formatPostTime, isOwnPost, normalizeSearchText, postErrorMessage,
  reportErrorMessage, toDateOrNull, validateDisplayName, validateEmail, validatePassword,
  validatePostBody, validateReportReason, validateTopic
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
  it('sama dengan empat kategori yang diizinkan Rules', () => {
    expect(POST_TOPICS).toEqual(['Obrolan Umum', 'Tanya Jawab', 'Info Layanan', 'Ide & Saran']);
    expect(FILTER_TOPICS[0]).toBe('Semua');
    expect(validateTopic('Ide & Saran')).toBe(true);
    expect(validateTopic('Semua')).toBe(false);
    expect(validateTopic('Lainnya')).toBe(false);
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
    expect(filterPosts(posts, 'Tanya Jawab', '')).toHaveLength(1);
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

describe('normalizeSearchText dan pencarian tanpa aksen', () => {
  it('mengabaikan huruf besar/kecil, aksen, dan spasi berlebih', () => {
    expect(normalizeSearchText('  CAFÉ   Pojok  ')).toBe('cafe pojok');
    expect(normalizeSearchText(null)).toBe('');
    expect(normalizeSearchText(undefined)).toBe('');
  });
  it('filterPosts menemukan pesan berbaris baru dan berbeda aksen', () => {
    const posts = [{ body: 'Kopi enak\ndi café sini', authorName: 'Sari', topic: 'Obrolan Umum' }];
    expect(filterPosts(posts, 'Semua', 'kopi enak di cafe')).toHaveLength(1);
    expect(filterPosts(posts, 'Semua', '   ')).toHaveLength(1);
  });
});

describe('daftar alasan laporan', () => {
  it('mengandung empat alasan yang diizinkan Rules', () => {
    expect(REPORT_REASONS).toEqual([
      'Spam atau promosi berulang',
      'Pelecehan atau ujaran kebencian',
      'Informasi berbahaya atau menyesatkan',
      'Lainnya'
    ]);
    expect(validateReportReason('Lainnya')).toBe(true);
    expect(validateReportReason('Alasan karangan')).toBe(false);
  });
});

describe('isOwnPost', () => {
  it('hanya benar bila UID penulis sama dengan UID pengguna', () => {
    expect(isOwnPost({ authorId: 'u1' }, { uid: 'u1' })).toBe(true);
    expect(isOwnPost({ authorId: 'u2' }, { uid: 'u1' })).toBe(false);
    expect(isOwnPost({ authorId: 'u1' }, null)).toBe(false);
    expect(isOwnPost({}, { uid: 'u1' })).toBe(false);
    expect(isOwnPost(null, { uid: 'u1' })).toBe(false);
  });
});

describe('formatPostTime', () => {
  const NOW = Date.UTC(2026, 9, 24, 10, 0, 0);
  const ago = (ms) => new Date(NOW - ms);

  it('null (menunggu server) tampil "Baru saja"; undefined tidak menampilkan apa pun', () => {
    expect(formatPostTime(null, NOW).label).toBe('Baru saja');
    expect(formatPostTime(undefined, NOW)).toBeNull();
    expect(formatPostTime('bukan tanggal', NOW)).toBeNull();
  });
  it('memakai label relatif dengan batas yang benar', () => {
    expect(formatPostTime(ago(30 * 1000), NOW).label).toBe('Baru saja');
    expect(formatPostTime(ago(5 * 60 * 1000), NOW).label).toBe('5 menit lalu');
    expect(formatPostTime(ago(3 * 3600 * 1000), NOW).label).toBe('3 jam lalu');
    expect(formatPostTime(ago(2 * 86400 * 1000), NOW).label).toBe('2 hari lalu');
  });
  it('lebih dari seminggu memakai tanggal; jam server di masa depan dianggap "Baru saja"', () => {
    const old = formatPostTime(ago(30 * 86400 * 1000), NOW);
    expect(old.label).not.toMatch(/lalu|Baru saja/);
    expect(old.iso).toBe(new Date(NOW - 30 * 86400 * 1000).toISOString());
    expect(formatPostTime(new Date(NOW + 60000), NOW).label).toBe('Baru saja');
  });
  it('menerima Firestore Timestamp (objek dengan toDate)', () => {
    const stamp = { toDate: () => ago(10 * 60 * 1000) };
    expect(formatPostTime(stamp, NOW).label).toBe('10 menit lalu');
    expect(toDateOrNull(stamp)).toBeInstanceOf(Date);
    expect(toDateOrNull({ toDate() { throw new Error('rusak'); } })).toBeNull();
  });
});

describe('pesan error laporan dan hapus', () => {
  it('memetakan kode Firebase ke pesan yang jelas tanpa membocorkan pesan mentah', () => {
    expect(reportErrorMessage({ code: 'permission-denied' })).toContain('aturan keamanan');
    expect(reportErrorMessage({ message: 'RAHASIA' })).not.toContain('RAHASIA');
    expect(deleteErrorMessage({ code: 'permission-denied' })).toContain('penulis');
    expect(deleteErrorMessage({ code: 'unavailable' })).toContain('Koneksi bermasalah');
    expect(deleteErrorMessage({ message: 'RAHASIA' })).not.toContain('RAHASIA');
  });
});
