// Tes komponen dengan Firebase di-mock (BUKAN E2E ke Firebase asli).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = vi.hoisted(() => ({ authCallback: null, snapshotNext: null, snapshotError: null }));

vi.mock('./firebase.js', () => ({ auth: { name: 'auth' }, db: { name: 'db' }, firebaseConfigured: true }));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, callback) => { state.authCallback = callback; return vi.fn(); }),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn((db, name) => ({ path: name })),
  doc: vi.fn((db, col, id) => ({ path: `${col}/${id}` })),
  getDoc: vi.fn(),
  limit: vi.fn((n) => ({ limit: n })),
  onSnapshot: vi.fn((q, next, error) => { state.snapshotNext = next; state.snapshotError = error; return vi.fn(); }),
  orderBy: vi.fn(),
  query: vi.fn((...args) => ({ args })),
  where: vi.fn((...args) => ({ where: args })),
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
  setDoc: vi.fn(),
}));

import * as fbAuth from 'firebase/auth';
import * as fs from 'firebase/firestore';
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
  vi.clearAllMocks();
  fs.getDoc.mockResolvedValue({ exists: () => true });
  fs.setDoc.mockResolvedValue(undefined);
  fs.addDoc.mockResolvedValue({ id: 'new' });
  fbAuth.updateProfile.mockResolvedValue(undefined);
  fbAuth.signOut.mockResolvedValue(undefined);
  fbAuth.signInWithEmailAndPassword.mockResolvedValue({ user: fakeUser() });
  fbAuth.createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1', email: 'sari@example.test' } });
});

afterEach(() => cleanup());

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

describe('halaman publik', () => {
  it('pengunjung membuka halaman komunitas; ada state loading lalu state kosong', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Obrolan komunitas' })).toBeTruthy();
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

  it('filter topik dan pencarian bekerja', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    emitPosts(POSTS);
    await screen.findByText('Halo semuanya');

    await user.click(screen.getByRole('button', { name: 'Tanya Jawab' }));
    expect(screen.queryByText('Halo semuanya')).toBeNull();
    expect(screen.getByText('Berapa harga layanan?')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Semua' }));
    await user.type(screen.getByPlaceholderText('Cari obrolan…'), 'dewi');
    expect(screen.getByText('Usul fitur baru')).toBeTruthy();
    expect(screen.queryByText('Halo semuanya')).toBeNull();

    await user.clear(screen.getByPlaceholderText('Cari obrolan…'));
    await user.type(screen.getByPlaceholderText('Cari obrolan…'), 'tidak-ada-hasil');
    expect(screen.getByText('Belum ada hasil pencarian')).toBeTruthy();
  });

  it('menampilkan state error dan dapat mencoba memuat ulang', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    act(() => { state.snapshotError(new Error('offline')); });
    expect(await screen.findByText('Obrolan belum dapat dimuat')).toBeTruthy();
    expect(fs.onSnapshot).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(fs.onSnapshot).toHaveBeenCalledTimes(2);
  });

  it('kategori di komposer tidak mengubah filter topik', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    emitPosts(POSTS);
    await user.selectOptions(screen.getByLabelText('Kategori obrolan'), 'Ide & Saran');
    expect(screen.getByRole('button', { name: 'Semua' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Halo semuanya')).toBeTruthy();
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
      displayName: 'Sari', email: 'sari@example.test', createdAt: '__SERVER_TS__', updatedAt: '__SERVER_TS__',
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

describe('membuat postingan', () => {
  it('pengguna yang belum login tidak bisa membuat postingan', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    emitPosts([]);
    await user.type(screen.getByLabelText('Isi obrolan'), 'Halo');
    await user.click(screen.getByRole('button', { name: 'Mulai obrolan' }));
    expect(fs.addDoc).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('pengguna login dapat membuat postingan dengan kategori dan identitas yang benar', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    emitPosts([]);
    await user.type(screen.getByLabelText('Isi obrolan'), '  Halo komunitas  ');
    await user.selectOptions(screen.getByLabelText('Kategori obrolan'), 'Info Layanan');
    await user.click(screen.getByRole('button', { name: 'Mulai obrolan' }));

    await waitFor(() => expect(fs.addDoc).toHaveBeenCalledTimes(1));
    expect(fs.addDoc).toHaveBeenCalledWith({ path: 'posts' }, {
      authorId: 'u1', authorName: 'Sari', body: 'Halo komunitas', topic: 'Info Layanan', createdAt: '__SERVER_TS__',
    });
    expect(await screen.findByText('Obrolan berhasil dipublikasikan.')).toBeTruthy();
    expect(screen.getByLabelText('Isi obrolan').value).toBe('');
  });

  it('keempat kategori tersedia di komposer', () => {
    render(<App />);
    const options = within(screen.getByLabelText('Kategori obrolan')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Obrolan Umum', 'Tanya Jawab', 'Info Layanan', 'Ide & Saran']);
  });

  it('pesan kosong tidak dikirim', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    await user.type(screen.getByLabelText('Isi obrolan'), '   ');
    await user.click(screen.getByRole('button', { name: 'Mulai obrolan' }));
    expect(await screen.findByText('Tulis pesan terlebih dahulu.')).toBeTruthy();
    expect(fs.addDoc).not.toHaveBeenCalled();
  });

  it('batas 2000 karakter: ada maxLength, penghitung, dan pesan lebih dari 2000 tidak dikirim', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    const textarea = screen.getByLabelText('Isi obrolan');
    expect(textarea.getAttribute('maxlength')).toBe('2000');
    await user.type(textarea, 'abcde');
    expect(screen.getByText('5/2000')).toBeTruthy();

    fireEvent.change(textarea, { target: { value: 'a'.repeat(2001) } });
    await user.click(screen.getByRole('button', { name: 'Mulai obrolan' }));
    expect(await screen.findByText('Pesan maksimal 2000 karakter.')).toBeTruthy();
    expect(fs.addDoc).not.toHaveBeenCalled();
  });

  it('akun tanpa nama tampilan memakai "Anggota", bukan bagian dari email', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser({ uid: 'u2', displayName: null, email: 'rahasia@example.test' }));
    await user.type(screen.getByLabelText('Isi obrolan'), 'Halo');
    await user.click(screen.getByRole('button', { name: 'Mulai obrolan' }));
    await waitFor(() => expect(fs.addDoc).toHaveBeenCalledTimes(1));
    expect(fs.addDoc.mock.calls[0][1].authorName).toBe('Anggota');
    expect(JSON.stringify(fs.addDoc.mock.calls[0][1])).not.toContain('rahasia');
  });

  it('penolakan dari aturan keamanan ditampilkan sebagai pesan yang jelas', async () => {
    fs.addDoc.mockRejectedValue({ code: 'permission-denied' });
    const user = userEvent.setup();
    render(<App />);
    emitAuth(fakeUser());
    await user.type(screen.getByLabelText('Isi obrolan'), 'Halo');
    await user.click(screen.getByRole('button', { name: 'Mulai obrolan' }));
    expect(await screen.findByText(/ditolak oleh aturan keamanan/)).toBeTruthy();
  });
});


describe('direktori dan pendaftaran warkop', () => {
  it('direktori hanya meminta warkop verified dan membatasi hasil', async () => {
    const user = userEvent.setup();
    render(<App />);
    emitAuth(null);
    await user.click(screen.getByRole('button', { name: 'Cari Warkop' }));
    expect(await screen.findByText('Memuat direktori…')).toBeTruthy();
    expect(fs.where).toHaveBeenCalledWith('verificationStatus', '==', 'verified');
    expect(fs.limit).toHaveBeenCalledWith(30);
    act(() => state.snapshotNext(snapshotOf([
      { id: 'w1', name: 'Warkop Pojok', address: 'Jl. Contoh, Lamongan', facilities: ['wifi'], priceRange: 'hemat' },
    ])));
    expect(await screen.findByRole('heading', { name: 'Warkop Pojok' })).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'Cari warkop' }), 'wifi');
    expect(screen.getByRole('heading', { name: 'Warkop Pojok' })).toBeTruthy();
    await user.clear(screen.getByRole('textbox', { name: 'Cari warkop' }));
    await user.type(screen.getByRole('textbox', { name: 'Cari warkop' }), 'tidak ada');
    expect(await screen.findByText('Warkop tidak ditemukan')).toBeTruthy();
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
    expect(await screen.findByRole('alert')).toHaveTextContent('koordinat');
    expect(fs.addDoc).not.toHaveBeenCalled();
  });
});
