// Tes komponen dengan Firebase di-mock (BUKAN E2E ke Firebase asli).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = vi.hoisted(() => ({ authCallback: null, snapshotNext: null, snapshotError: null, warungsSnapshots: [] }));

vi.mock('./firebase.js', () => ({ auth: { name: 'auth' }, db: { name: 'db' }, firebaseConfigured: true }));
vi.mock('./media/uploadWarkopMedia.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, uploadWarkopMedia: vi.fn() };
});

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, callback) => { state.authCallback = callback; return vi.fn(); }),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  collection: vi.fn((db, ...segments) => ({ path: segments.join('/') })),
  doc: vi.fn((db, col, id) => { const reference = { path: id === undefined && col === undefined && db?.path ? `${db.path}/new-post` : `${col}/${id}` }; Object.defineProperty(reference, 'id', { value: id ?? (col === undefined && db?.path ? 'new-post' : undefined), enumerable: false }); return reference; }),
  getCountFromServer: vi.fn(() => Promise.resolve({ data: () => ({ count: 0 }) })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn((amount) => ({ increment: amount })),
  limit: vi.fn((n) => ({ limit: n })),
  onSnapshot: vi.fn((q, next, error) => {
    // Simpan callback feed/direktori saja; subscription likes/replies tidak boleh menimpa helper tes.
    const path = q?.args?.[0]?.path ?? q?.path;
    if (path === 'posts') {
      state.snapshotNext = next;
      state.snapshotError = error;
    }
    if (path === 'warungs') {
      state.warungsSnapshots.push({ query: q, next, error });
      state.snapshotNext = next;
      state.snapshotError = error;
    }
    return vi.fn();
  }),
  orderBy: vi.fn(),
  query: vi.fn((...args) => ({ args })),
  runTransaction: vi.fn(async (db, callback) => callback({ get: vi.fn(), set: vi.fn(), update: vi.fn(), delete: vi.fn() })),
  startAfter: vi.fn((cursor) => ({ startAfter: cursor })),
  where: vi.fn((...args) => ({ where: args })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  writeBatch: vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
  setDoc: vi.fn(),
}));

import * as fbAuth from 'firebase/auth';
import * as fs from 'firebase/firestore';
import * as media from './media/uploadWarkopMedia.js';
import App from './App.jsx';

const fakeUser = (overrides = {}) => ({ uid: 'u1', email: 'sari@example.test', displayName: 'Sari', ...overrides });
const snapshotOf = (posts) => ({
  docs: posts.map(({ id, ...rest }) => ({ id, data: () => rest })),
});
const emitAuth = (user) => act(() => { state.authCallback(user); });
const emitPosts = (posts) => act(() => { state.snapshotNext(snapshotOf(posts)); });

const POSTS = [
  { id: 'p1', authorName: 'Sari', body: 'Halo semuanya', topic: 'Obrolan Umum' },
  { id: 'p2', authorName: 'Budi', body: 'Berapa harga layanan?', topic: 'Tanya Jawab' },
  { id: 'p3', authorName: 'Dewi', body: 'Usul fitur baru', topic: 'Ide & Saran' },
];

beforeEach(() => {
  state.warungsSnapshots = [];
  window.localStorage.clear();
  vi.clearAllMocks();
  fs.getDoc.mockResolvedValue({ exists: () => true, data: () => ({}) });
  fs.getDocs.mockResolvedValue({ docs: [], empty: true });
  fs.getCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) });
  fs.updateDoc.mockResolvedValue(undefined);
  fs.setDoc.mockResolvedValue(undefined);
  fs.addDoc.mockResolvedValue({ id: 'new' });
  fs.writeBatch.mockImplementation(() => ({ set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) }));
  fbAuth.updateProfile.mockResolvedValue(undefined);
  fbAuth.signOut.mockResolvedValue(undefined);
  fbAuth.signInWithEmailAndPassword.mockResolvedValue({ user: fakeUser() });
  fbAuth.createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1', email: 'sari@example.test' } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openRegister(user) {
  await user.click(screen.getByRole('button', { name: 'Gabung komunitas' }));
  return screen.getByRole('dialog');
}

async function fillAuth(user, dialog, { name, email, password }) {
  if (name !== undefined) {
    const field = within(dialog).getByLabelText('Nama tampilan');
    await user.clear(field);
    if (name) await user.type(field, name);
  }
  const emailField = within(dialog).getByLabelText('Email');
  await user.clear(emailField);
  if (email) await user.type(emailField, email);
  const passwordField = within(dialog).getByLabelText('Kata sandi');
  await user.clear(passwordField);
  if (password) await user.type(passwordField, password);
}

describe('laporan obrolan', () => {
  it('anggota dapat mengirim laporan dengan alasan terpilih', async () => {
    render(<App />);
    emitAuth(fakeUser());
    emitPosts([{ id: 'post-1', authorId: 'author-1', authorName: 'Budi', body: 'Pesan contoh', topic: 'Obrolan Umum' }]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Opsi postingan' }));
    await user.click(await screen.findByRole('menuitem', { name: /Laporkan obrolan/ }));
    await user.selectOptions(screen.getByLabelText('Alasan laporan'), 'Lainnya');
    await user.click(screen.getByRole('button', { name: 'Kirim laporan' }));
    await waitFor(() => expect(fs.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ targetPostId: 'post-1', targetAuthorId: 'author-1', reporterUid: 'u1', reason: 'Lainnya', createdAt: '__SERVER_TS__' })));
    expect(await screen.findByText('Laporan terkirim kepada admin untuk ditinjau.')).toBeTruthy();
    expect(screen.getByText('Laporan terkirim kepada admin untuk ditinjau.').tagName).toBe('DIV');
  });
});

describe('preferensi tampilan', () => {
  it('mengaktifkan mode gelap dan menyimpan pilihan pengguna', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Aktifkan mode gelap' });
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('warkoplink:theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Aktifkan mode terang' })).toBeTruthy();
  });
});

describe('halaman publik', () => {
  it('pengunjung membuka halaman komunitas; ada state loading lalu state kosong', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Suasana komunitas' })).toBeTruthy();
    expect(screen.getByText('Memuat obrolan…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Memuat…' })).toBeTruthy();
    emitAuth(null);
    emitPosts([]);
    expect(await screen.findByText('Belum ada obrolan')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeTruthy();
    expect(screen.queryByText('Memuat obrolan…')).toBeNull();
  });

  it('menampilkan daftar postingan dari Firestore', async () => {
    render(<App />);
    emitAuth(null);
    emitPosts(POSTS);
    expect(await screen.findByText('Halo semuanya')).toBeTruthy();
    expect(screen.getByText('Berapa harga layanan?')).toBeTruthy();
    expect(screen.getByText('Usul fitur baru')).toBeTruthy();
  });

  it('Beranda hanya menampilkan tiga cuplikan dan tautan membuka feed Obrolan lengkap', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    emitPosts([
      ...POSTS,
      { id: 'p4', authorName: 'Raka', body: 'Obrolan keempat', topic: 'Ngopi Bareng' }
    ]);
    expect(await screen.findByText('Halo semuanya')).toBeTruthy();
    expect(screen.queryByText('Obrolan keempat')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Lihat semua obrolan/ }));
    expect(screen.getByText('Obrolan keempat')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Obrolan komunitas' })).toBeTruthy();
    expect(screen.getByLabelText('Kategori obrolan')).toBeTruthy();
  });

  it('filter topik dan pencarian bekerja', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    emitPosts(POSTS);
    await screen.findByText('Halo semuanya');
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));

    await user.click(screen.getByRole('button', { name: 'Tanya Warkop' }));
    expect(screen.queryByText('Halo semuanya')).toBeNull();
    expect(screen.getByText('Berapa harga layanan?')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Semua' }));
    await user.type(screen.getByPlaceholderText('Cari di semua obrolan…'), 'dewi');
    expect(screen.getByText('Usul fitur baru')).toBeTruthy();
    expect(screen.queryByText('Halo semuanya')).toBeNull();

    await user.clear(screen.getByPlaceholderText('Cari di semua obrolan…'));
    await user.type(screen.getByPlaceholderText('Cari di semua obrolan…'), 'tidak-ada-hasil');
    expect(screen.getByText('Belum ada hasil pencarian')).toBeTruthy();
  });

  it('menampilkan state error dan dapat mencoba memuat ulang', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    act(() => { state.snapshotError(new Error('offline')); });
    expect(await screen.findByText('Obrolan belum dapat dimuat')).toBeTruthy();
    const postFeedSubscriptions = () => fs.onSnapshot.mock.calls.filter(([q]) => (q?.args?.[0]?.path ?? q?.path) === 'posts').length;
    expect(postFeedSubscriptions()).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(postFeedSubscriptions()).toBe(2);
  });

  it('navigasi dashboard menyaring feed ke kategori yang dipilih', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    emitPosts(POSTS);
    await screen.findByText('Halo semuanya');

    await user.click(screen.getByRole('button', { name: 'Desktop: Jual beli & jasa' }));
    expect(screen.getByRole('button', { name: 'Jual Beli & Jasa Lokal' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Halo semuanya')).toBeNull();
    expect(screen.queryByText('Berapa harga layanan?')).toBeNull();
    expect(screen.queryByText('Usul fitur baru')).toBeNull();
    expect(screen.getByText('Belum ada obrolan di topik ini')).toBeTruthy();
  });

  it('kategori aktif menentukan kategori posting tanpa dropdown kedua', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    emitPosts(POSTS);
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: 'Info & Acara' }));
    expect(screen.getByRole('button', { name: 'Info & Acara' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('combobox', { name: 'Kategori obrolan' })).toBeNull();
  });
});

describe('registrasi', () => {
  it('validasi form memberi pesan jelas dan tidak memanggil Firebase', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    const dialog = await openRegister(user);
    const submit = within(dialog).getByRole('button', { name: 'Buat akun' });

    await fillAuth(user, dialog, { name: 'Sari', email: 'abc', password: 'rahasia1' });
    await user.click(submit);
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Format email tidak valid.');

    await fillAuth(user, dialog, { name: 'Sari', email: 'sari@example.test', password: '123' });
    await user.click(submit);
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Kata sandi minimal 6 karakter.');

    await fillAuth(user, dialog, { name: 'a ', email: 'sari@example.test', password: 'rahasia1' });
    await user.click(submit);
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Nama tampilan minimal 2 karakter.');

    expect(fbAuth.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('email yang sudah terdaftar menampilkan pesan yang jelas', async () => {
    fbAuth.createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    const dialog = await openRegister(user);
    await fillAuth(user, dialog, { name: 'Sari', email: 'sari@example.test', password: 'rahasia1' });
    await user.click(within(dialog).getByRole('button', { name: 'Buat akun' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Email ini sudah terdaftar. Silakan masuk.');
  });

  it('registrasi berhasil membuat akun dan profil milik pengguna', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    const dialog = await openRegister(user);
    await fillAuth(user, dialog, { name: '  Sari  ', email: 'sari@example.test', password: 'rahasia1' });
    await user.click(within(dialog).getByRole('button', { name: 'Buat akun' }));

    expect(await screen.findByText('Akun berhasil dibuat. Selamat bergabung!')).toBeTruthy();
    expect(fbAuth.createUserWithEmailAndPassword).toHaveBeenCalledWith({ name: 'auth' }, 'sari@example.test', 'rahasia1');
    expect(fbAuth.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), { displayName: 'Sari' });
    expect(fs.setDoc).toHaveBeenCalledWith({ path: 'profiles/u1' }, {
      displayName: 'Sari', email: 'sari@example.test', createdAt: '__SERVER_TS__', updatedAt: '__SERVER_TS__',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('jika profil gagal dibuat, akun tetap dibuat dan pengguna diberi tahu tanpa error menyesatkan', async () => {
    fs.setDoc.mockRejectedValue({ code: 'permission-denied' });
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    const dialog = await openRegister(user);
    await fillAuth(user, dialog, { name: 'Sari', email: 'sari@example.test', password: 'rahasia1' });
    await user.click(within(dialog).getByRole('button', { name: 'Buat akun' }));

    expect(await screen.findByText(/profil belum tersimpan/)).toBeTruthy();
    expect(screen.queryByText(/Autentikasi gagal/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('login, sesi, dan logout', () => {
  it('login gagal menampilkan pesan, login berhasil menutup dialog', async () => {
    fbAuth.signInWithEmailAndPassword.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    await user.click(screen.getByRole('button', { name: 'Masuk' }));
    const dialog = screen.getByRole('dialog');
    await fillAuth(user, dialog, { email: 'sari@example.test', password: 'salah123' });
    await user.click(within(dialog).getByRole('button', { name: 'Masuk' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Email atau kata sandi salah.');

    await fillAuth(user, dialog, { email: 'sari@example.test', password: 'rahasia1' });
    await user.click(within(dialog).getByRole('button', { name: 'Masuk' }));
    expect(await screen.findByText('Berhasil masuk ke WarkopLink.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sesi autentikasi dipulihkan saat halaman dimuat ulang', async () => {
    render(<App />);
    emitAuth(fakeUser());
    expect(await screen.findByText('Masuk sebagai Sari')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeTruthy();
  });

  it('profil yang hilang dibuat otomatis saat sesi dipulihkan', async () => {
    fs.getDoc.mockResolvedValue({ exists: () => false });
    render(<App />);
    emitAuth(fakeUser());
    await waitFor(() => expect(fs.setDoc).toHaveBeenCalledWith({ path: 'profiles/u1' }, {
      displayName: 'Sari', email: 'sari@example.test', photoURL: '', createdAt: '__SERVER_TS__', updatedAt: '__SERVER_TS__',
    }));
  });

  it('logout memanggil signOut', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    await user.click(await screen.findByRole('button', { name: 'Keluar' }));
    expect(fbAuth.signOut).toHaveBeenCalledWith({ name: 'auth' });
    expect(await screen.findByText('Anda sudah keluar dari akun.')).toBeTruthy();
  });
});

describe('balasan komentar', () => {
  it('menampilkan balasan seketika dengan status mengirim sebelum Firestore selesai', async () => {
    let resolveAdd;
    fs.addDoc.mockImplementationOnce(() => new Promise(resolve => { resolveAdd = resolve; }));
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    emitPosts([{ id: 'post-reply', authorId: 'u2', authorName: 'Budi', body: 'Diskusi contoh', topic: 'Obrolan Umum' }]);

    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(await screen.findByRole('button', { name: 'Balas' }));
    await user.type(await screen.findByLabelText('Tulis komentar'), 'Setuju, terima kasih');
    await user.click(screen.getByRole('button', { name: 'Kirim balasan' }));

    expect(await screen.findByText('Setuju, terima kasih')).toBeTruthy();
    expect(screen.getByText('Mengirim…')).toBeTruthy();
    expect(fs.addDoc).toHaveBeenCalledWith({ path: 'posts/post-reply/replies' }, {
      authorId: 'u1', authorName: 'Sari', authorPhotoURL: null,
      body: 'Setuju, terima kasih', createdAt: '__SERVER_TS__',
    });

    await act(async () => { resolveAdd({ id: 'reply-saved' }); });
    expect(await screen.findByText('Balasan berhasil dikirim.')).toBeTruthy();
    expect(screen.queryByText('Mengirim…')).toBeNull();
  });

  it('menghapus balasan optimistis dan mengembalikan teks jika Firestore menolak', async () => {
    fs.addDoc.mockRejectedValueOnce({ code: 'permission-denied' });
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    emitPosts([{ id: 'post-reply', authorId: 'u2', authorName: 'Budi', body: 'Diskusi contoh', topic: 'Obrolan Umum' }]);

    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(await screen.findByRole('button', { name: 'Balas' }));
    await user.type(await screen.findByLabelText('Tulis komentar'), 'Balasan perlu dipulihkan');
    await user.click(screen.getByRole('button', { name: 'Kirim balasan' }));

    expect(await screen.findByText('Balasan ditolak oleh aturan keamanan.')).toBeTruthy();
    // Draft harus kembali ke input; queryByText juga mencocokkan teks di dalam textarea.
    expect(screen.getByLabelText('Tulis komentar').value).toBe('Balasan perlu dipulihkan');
  });
});

describe('membuat postingan', () => {
  it('pengguna yang belum login diminta masuk sebelum mulai menulis', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    emitPosts([]);
    expect(screen.queryByRole('textbox', { name: 'Isi obrolan' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: /Masuk untuk mulai ngobrol/ }));
    expect(fs.addDoc).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('pengguna login dapat membuat postingan dengan kategori dan identitas yang benar', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    emitPosts([]);
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: 'Info & Acara' }));
    await user.click(screen.getByRole('button', { name: /Ayo ngobrol/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kategori posting' }), 'Info & Acara');
    await user.type(screen.getByLabelText('Isi obrolan'), '  Halo komunitas  ');
    await user.click(screen.getByRole('button', { name: 'Kirim' }));

    await waitFor(() => expect(fs.setDoc).toHaveBeenCalledWith({ path: 'posts/new-post' }, expect.objectContaining({
      authorId: 'u1', authorName: 'Sari', authorPhotoURL: null, body: 'Halo komunitas', topic: 'Info & Acara', postType: 'Info lokal', eventKind: 'Nobar', createdAt: '__SERVER_TS__',
      reactions: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, totalReactions: 0,
    })));
    expect(await screen.findByText(/Obrolan berhasil dipublikasikan/)).toBeTruthy();
    expect(screen.getByLabelText('Isi obrolan').value).toBe('');
    expect(screen.getByRole('button', { name: 'Kirim' }).disabled).toBe(true);
  });

  it('lima kategori final tersedia sebagai tab feed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    for (const category of ['Ngopi Bareng', 'Tanya Warkop', 'Info & Acara', 'Loker', 'Jual Beli & Jasa Lokal']) {
      expect(screen.getByRole('button', { name: category })).toBeTruthy();
    }
    expect(screen.queryByRole('combobox', { name: 'Kategori obrolan' })).toBeNull();
  });

  it('pesan kosong tidak dikirim', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: /Ayo ngobrol/ }));
    await user.type(screen.getByLabelText('Isi obrolan'), '   ');
    expect(screen.getByRole('button', { name: 'Kirim' }).disabled).toBe(true);
    expect(fs.addDoc).not.toHaveBeenCalled();
  });

  it('batas 2000 karakter: ada maxLength, penghitung, dan pesan lebih dari 2000 tidak dikirim', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: /Ayo ngobrol/ }));
    const textarea = screen.getByLabelText('Isi obrolan');
    expect(textarea.getAttribute('maxlength')).toBe('2000');
    await user.type(textarea, 'abcde');
    expect(screen.getByText('5/2000')).toBeTruthy();

    fireEvent.change(textarea, { target: { value: 'a'.repeat(2001) } });
    await user.click(screen.getByRole('button', { name: 'Kirim' }));
    expect(await screen.findByText('Pesan maksimal 2000 karakter.')).toBeTruthy();
    expect(fs.addDoc).not.toHaveBeenCalled();
  });

  it('akun tanpa nama tampilan memakai "Anggota", bukan bagian dari email', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser({ uid: 'u2', displayName: null, email: 'rahasia@example.test' }));
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: /Ayo ngobrol/ }));
    await user.type(screen.getByLabelText('Isi obrolan'), 'Halo');
    await user.click(screen.getByRole('button', { name: 'Kirim' }));
    await waitFor(() => expect(fs.setDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'posts/new-post' }), expect.objectContaining({ authorName: 'Anggota' })));
    const postedData = fs.setDoc.mock.calls.find(([ref, data]) => ref?.path?.startsWith('posts/'))?.[1];
    expect(postedData.authorName).toBe('Anggota');
    expect(JSON.stringify(postedData)).not.toContain('rahasia');
  });

  it('penolakan dari aturan keamanan ditampilkan sebagai pesan yang jelas', async () => {
    fs.setDoc.mockRejectedValue({ code: 'permission-denied' });
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(screen.getByRole('button', { name: /Ayo ngobrol/ }));
    await user.type(screen.getByLabelText('Isi obrolan'), 'Halo');
    await user.click(screen.getByRole('button', { name: 'Kirim' }));
    expect(await screen.findByText(/Profil Anda belum tersimpan sehingga pesan belum dapat dikirim/)).toBeTruthy();
  });
});


describe('direktori dan pendaftaran warkop', () => {
  it('direktori dan daftar mention tidak memerlukan composite index nameNormalized', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    await user.click(screen.getByRole('button', { name: 'Cari Warkop' }));
    expect(fs.orderBy).not.toHaveBeenCalledWith('nameNormalized', 'asc');
  });

  it('direktori hanya meminta warkop verified dan membatasi hasil', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    await user.click(screen.getByRole('button', { name: 'Cari Warkop' }));
    expect(await screen.findByText('Memuat direktori…')).toBeTruthy();
    expect(fs.where).toHaveBeenCalledWith('verificationStatus', '==', 'verified');
    expect(fs.limit).toHaveBeenCalledWith(30);
    act(() => state.snapshotNext(snapshotOf([
      { id: 'w1', name: 'Warkop Pojok', address: 'Jl. Contoh, Lamongan', facilities: ['wifi'], priceRange: 'hemat', coordinates: { lat: -7.0001, lng: 112.281 }, openingHours: { keterangan: 'Setiap hari 08.00–23.00' } },
    ])));
    expect(await screen.findByRole('heading', { name: 'Warkop Pojok' })).toBeTruthy();
    expect(screen.getByText('Jam buka: Setiap hari 08.00–23.00')).toBeTruthy();
    const searchInput = screen.getByRole('textbox', { name: 'Cari warkop' });
    await user.type(searchInput, '  WARKOP   POJOK  ');
    expect(screen.getByRole('heading', { name: 'Warkop Pojok' })).toBeTruthy();
    await user.clear(searchInput);
    expect(screen.getByRole('link', { name: 'Lihat lokasi di peta' }).getAttribute('href')).toContain('query=-7.0001%2C112.281');
    await user.type(screen.getByRole('textbox', { name: 'Cari warkop' }), 'wifi');
    expect(screen.getByRole('heading', { name: 'Warkop Pojok' })).toBeTruthy();
    await user.clear(screen.getByRole('textbox', { name: 'Cari warkop' }));
    await user.type(screen.getByRole('textbox', { name: 'Cari warkop' }), 'tidak ada');
    expect(await screen.findByText('Warkop tidak ditemukan')).toBeTruthy();
  });

  it('memuat direktori secara bertahap tanpa mengambil seluruh koleksi sekaligus', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    await user.click(screen.getByRole('button', { name: 'Cari Warkop' }));
    const firstPage = Array.from({ length: 30 }, (_, index) => ({
      id: `w${index + 1}`,
      name: `Warkop ${index + 1}`,
      address: 'Jl. Contoh, Lamongan',
      facilities: [],
    }));
    const directorySnapshot = state.warungsSnapshots.find(({ query }) => query?.args?.some((argument) => argument?.limit === 30));
    expect(directorySnapshot).toBeTruthy();
    act(() => directorySnapshot.next(snapshotOf(firstPage)));
    expect(await screen.findByRole('heading', { name: 'Warkop 1' })).toBeTruthy();
    const nextPage = snapshotOf([
      { id: 'w31', name: 'Warkop 31', address: 'Jl. Contoh, Lamongan', facilities: [] },
    ]);
    fs.getDocs.mockResolvedValueOnce(nextPage);
    await user.click(screen.getByRole('button', { name: 'Muat 30 warkop lagi' }));
    expect(await screen.findByRole('heading', { name: 'Warkop 31' })).toBeTruthy();
    expect(fs.getDocs).toHaveBeenCalledTimes(1);
    expect(fs.startAfter).toHaveBeenCalledWith(expect.objectContaining({ id: 'w30' }));
    expect(fs.limit).toHaveBeenCalledWith(30);
  });

  it('form pendaftaran mengirim status pending dengan identitas pemilik dari sesi', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    await user.click(screen.getByRole('button', { name: 'Daftar' }));
    await user.type(screen.getByLabelText('Nama warkop'), 'Warkop Pojok');
    await user.type(screen.getByLabelText('Alamat lengkap di Kabupaten Lamongan'), 'Jl. Contoh No. 12, Lamongan');
    await user.type(screen.getByLabelText('Lintang (latitude)'), '-7.0001');
    await user.type(screen.getByLabelText('Bujur (longitude)'), '112.2810');
    await user.type(screen.getByLabelText('Fasilitas, pisahkan dengan koma'), 'Wi-Fi, parkir');
    await user.click(screen.getByRole('button', { name: 'Kirim pendaftaran' }));
    await waitFor(() => expect(fs.addDoc).toHaveBeenCalledWith({ path: 'warungs' }, expect.objectContaining({
      name: 'Warkop Pojok',
      nameNormalized: 'warkop pojok',
      ownerUid: 'u1',
      coordinates: { lat: -7.0001, lng: 112.281 },
      regionCode: 'lamongan-kab',
      facilities: ['wi-fi', 'parkir'],
      verificationStatus: 'pending',
      createdAt: '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    })));
    expect(await screen.findByText(/Pendaftaran terkirim/)).toBeTruthy();
  });

  it('menunjukkan penyebab foto gagal dan cara melanjutkan pendaftaran tersimpan', async () => {
    const user = userEvent.setup();
    media.uploadWarkopMedia.mockRejectedValueOnce(new Error('Invalid or expired Firebase ID token'));
    render(<App />);
    emitAuth(fakeUser());
    await user.click(screen.getByRole('button', { name: 'Daftar' }));
    await user.type(screen.getByLabelText('Nama warkop'), 'Warkop Pojok');
    await user.type(screen.getByLabelText('Alamat lengkap di Kabupaten Lamongan'), 'Jl. Contoh No. 12, Lamongan');
    await user.type(screen.getByLabelText('Lintang (latitude)'), '-7.0001');
    await user.type(screen.getByLabelText('Bujur (longitude)'), '112.2810');
    await user.upload(screen.getByLabelText(/Foto warkop/), new File(['foto'], 'warkop.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('button', { name: 'Kirim pendaftaran' }));

    expect(await screen.findByText(/Pendaftaran new sudah tersimpan, tetapi foto belum berhasil diunggah/)).toBeTruthy();
    expect(screen.getByText(/Sesi masuk kedaluwarsa/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lanjutkan unggah foto' })).toBeTruthy();
  });


  it('pengunjung tanpa login diarahkan ke autentikasi dan tidak dapat mengirim pendaftaran', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    await user.click(screen.getByRole('button', { name: 'Daftar' }));
    await user.type(screen.getByLabelText('Nama warkop'), 'Warkop Pojok');
    await user.type(screen.getByLabelText('Alamat lengkap di Kabupaten Lamongan'), 'Jl. Contoh No. 12, Lamongan');
    await user.type(screen.getByLabelText('Lintang (latitude)'), '-7.0001');
    await user.type(screen.getByLabelText('Bujur (longitude)'), '112.2810');
    await user.click(screen.getByRole('button', { name: 'Kirim pendaftaran' }));
    expect(fs.addDoc).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Masuk atau buat akun terlebih dahulu/)).toBeTruthy();
  });

  it('validasi koordinat mencegah data lokasi tidak valid dikirim', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    await user.click(screen.getByRole('button', { name: 'Daftar' }));
    await user.type(screen.getByLabelText('Nama warkop'), 'Warkop Pojok');
    await user.type(screen.getByLabelText('Alamat lengkap di Kabupaten Lamongan'), 'Jl. Contoh No. 12, Lamongan');
    await user.type(screen.getByLabelText('Lintang (latitude)'), '200');
    await user.type(screen.getByLabelText('Bujur (longitude)'), '112');
    await user.click(screen.getByRole('button', { name: 'Kirim pendaftaran' }));
    expect((await screen.findByRole('alert')).textContent).toContain('koordinat');
    expect(fs.addDoc).not.toHaveBeenCalled();
  });
});


describe('unggah poster Info & Acara', () => {
  it('menerbitkan acara dan mengirim poster melalui gateway untuk warkop terverifikasi milik pengguna', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    emitPosts([]);
    act(() => state.warungsSnapshots[0].next(snapshotOf([{
      id: 'warung-1', ownerUid: 'u1', name: 'Warkop Pojok', verificationStatus: 'verified'
    }])));
    await user.click(screen.getByRole('button', { name: 'Obrolan' }));
    await user.click(await screen.findByRole('button', { name: /Ayo ngobrol/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kategori posting' }), 'Info & Acara');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Warkop penyelenggara' }), 'warung-1');
    await user.type(screen.getByRole('textbox', { name: 'Isi obrolan' }), 'Nobar final malam ini');
    const poster = new File(['poster-bytes'], 'poster.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText(/Poster acara/), poster);
    await user.click(screen.getByRole('button', { name: 'Kirim' }));

    await waitFor(() => expect(media.uploadWarkopMedia).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ uid: 'u1' }),
      mediaType: 'event',
      resourceId: 'new-post',
      file: poster
    })));
    expect(fs.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      topic: 'Info & Acara',
      warungId: 'warung-1',
      body: 'Nobar final malam ini'
    }));
  });
});



describe('notifikasi sementara dan unggah foto profil', () => {
  it('tidak menampilkan error identitas Firebase mentah pada foto profil', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    emitAuth(fakeUser());
    await user.click(screen.getByRole('button', { name: 'Akun' }));
    await user.click(await screen.findByRole('button', { name: 'Edit profil' }));

    media.uploadWarkopMedia.mockRejectedValueOnce(
      new Error('Firebase account is disabled or status is unknown')
    );
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    fireEvent.change(input, {
      target: { files: [new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' })] }
    });

    expect(await screen.findByText(
      'Sesi akun tidak dapat diverifikasi. Keluar dari akun, masuk kembali, lalu coba lagi. Jika masih gagal, hubungi admin.'
    )).toBeTruthy();
    expect(screen.queryByText(/Firebase account is disabled/)).toBeNull();
  });

  it('menghilangkan notifikasi sementara setelah tiga detik', () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Tersimpan/ }));
    const notice = 'Menu Tersimpan belum tersedia. Tidak ada daftar tersimpan yang dibuat-buat.';
    expect(screen.getByText(notice)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText(notice)).toBeNull();
  });
});


describe('aksesibilitas form pendaftaran warkop', () => {
  it('menjelaskan format lintang dan bujur pada layar Daftar', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Daftar' }));

    const latitude = screen.getByPlaceholderText('Contoh: -7.0001');
    const longitude = screen.getByPlaceholderText('Contoh: 112.2810');
    expect(latitude.getAttribute('inputmode')).toBe('decimal');
    expect(longitude.getAttribute('inputmode')).toBe('decimal');
    expect(screen.getByText(/Lintang: angka utara\/selatan/)).toBeTruthy();
    expect(screen.getByText(/Bujur: angka timur\/barat/)).toBeTruthy();
  });
});
