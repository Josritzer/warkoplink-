// Tes tampilan ChatPanel dengan objek `chat` tiruan: tidak memerlukan Firebase sama sekali.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPanel from './ChatPanel.jsx';

afterEach(() => cleanup());

const NOW = Date.now();
const fiveMinutesAgo = new Date(NOW - 5 * 60 * 1000 - 10 * 1000);

const makeChat = (overrides = {}) => ({
  status: 'ready', visiblePosts: [], totalPosts: 0, reload: vi.fn(),
  topic: 'Semua', setTopic: vi.fn(), search: '', setSearch: vi.fn(),
  draft: '', setDraft: vi.fn(), composerTopic: 'Obrolan Umum', setComposerTopic: vi.fn(),
  posting: false, cooldownRemaining: 0, submitPost: vi.fn((event) => event.preventDefault()),
  reportingPostId: '', reportReason: 'Spam atau promosi berulang', setReportReason: vi.fn(),
  reporting: false, toggleReport: vi.fn(), closeReport: vi.fn(), submitReport: vi.fn((event) => event.preventDefault()),
  confirmDeleteId: '', deletingId: '', askDelete: vi.fn(), cancelDelete: vi.fn(), confirmDelete: vi.fn(),
  ...overrides,
});

const signedIn = { uid: 'u1', displayName: 'Sari', email: 'sari@example.test' };
const othersPost = { id: 'p1', authorId: 'u2', authorName: 'Budi', topic: 'Tanya Jawab', body: 'Berapa harganya?', createdAt: fiveMinutesAgo };
const ownPost = { id: 'p2', authorId: 'u1', authorName: 'Sari', topic: 'Obrolan Umum', body: 'Halo semua', createdAt: null };

describe('keadaan daftar', () => {
  it('menampilkan loading, error dengan tombol coba lagi, dan keadaan kosong', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ChatPanel chat={makeChat({ status: 'loading' })} user={null} firebaseConfigured />);
    expect(screen.getByText('Memuat obrolan…')).toBeTruthy();

    const reload = vi.fn();
    rerender(<ChatPanel chat={makeChat({ status: 'error', reload })} user={null} firebaseConfigured />);
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(reload).toHaveBeenCalledTimes(1);

    rerender(<ChatPanel chat={makeChat()} user={null} firebaseConfigured />);
    expect(screen.getByText('Belum ada obrolan')).toBeTruthy();
    rerender(<ChatPanel chat={makeChat({ topic: 'Tanya Jawab' })} user={null} firebaseConfigured />);
    expect(screen.getByText('Belum ada obrolan di topik ini')).toBeTruthy();
    rerender(<ChatPanel chat={makeChat({ search: 'xyz' })} user={null} firebaseConfigured />);
    expect(screen.getByText('Belum ada hasil pencarian')).toBeTruthy();
  });

  it('pencarian hanya spasi tidak dianggap sedang mencari', () => {
    render(<ChatPanel chat={makeChat({ search: '   ' })} user={null} firebaseConfigured />);
    expect(screen.getByText('Belum ada obrolan')).toBeTruthy();
  });

  it('memberi catatan saat jumlah obrolan mencapai batas tampilan', () => {
    render(<ChatPanel chat={makeChat({ visiblePosts: [othersPost], totalPosts: 100 })} user={null} firebaseConfigured />);
    expect(screen.getByText('Menampilkan 100 obrolan terbaru.')).toBeTruthy();
  });

  it('memperingatkan bila Firebase belum dikonfigurasi', () => {
    render(<ChatPanel chat={makeChat()} user={null} firebaseConfigured={false} />);
    expect(screen.getByText(/Firebase belum tersambung/)).toBeTruthy();
  });
});

describe('kartu obrolan', () => {
  it('menampilkan waktu relatif, "Baru saja" untuk pesan yang menunggu server, dan tombol sesuai penulis', () => {
    render(<ChatPanel chat={makeChat({ visiblePosts: [othersPost, ownPost], totalPosts: 2 })} user={signedIn} firebaseConfigured />);
    expect(screen.getByText('5 menit lalu')).toBeTruthy();
    expect(screen.getByText('Baru saja')).toBeTruthy();
    // Obrolan orang lain: Laporkan. Obrolan sendiri: Hapus (tanpa Laporkan).
    expect(screen.getAllByRole('button', { name: 'Laporkan' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Hapus' })).toHaveLength(1);
  });

  it('tombol Hapus dan Laporkan memanggil aksi dengan obrolan yang benar', async () => {
    const user = userEvent.setup();
    const chat = makeChat({ visiblePosts: [othersPost, ownPost], totalPosts: 2 });
    render(<ChatPanel chat={chat} user={signedIn} firebaseConfigured />);
    await user.click(screen.getByRole('button', { name: 'Hapus' }));
    expect(chat.askDelete).toHaveBeenCalledWith(ownPost);
    await user.click(screen.getByRole('button', { name: 'Laporkan' }));
    expect(chat.toggleReport).toHaveBeenCalledWith(othersPost);
  });

  it('konfirmasi hapus: "Ya, hapus" menghapus dan "Batal" menutup', async () => {
    const user = userEvent.setup();
    const chat = makeChat({ visiblePosts: [ownPost], totalPosts: 1, confirmDeleteId: 'p2' });
    render(<ChatPanel chat={chat} user={signedIn} firebaseConfigured />);
    const group = screen.getByRole('group', { name: 'Konfirmasi hapus obrolan' });
    expect(within(group).getByText('Hapus obrolan ini secara permanen?')).toBeTruthy();
    await user.click(within(group).getByRole('button', { name: 'Ya, hapus' }));
    expect(chat.confirmDelete).toHaveBeenCalledWith(ownPost);
    await user.click(within(group).getByRole('button', { name: 'Batal' }));
    expect(chat.cancelDelete).toHaveBeenCalledTimes(1);
  });

  it('saat menghapus, tombol konfirmasi dinonaktifkan agar tidak terkirim dua kali', () => {
    render(<ChatPanel chat={makeChat({ visiblePosts: [ownPost], totalPosts: 1, confirmDeleteId: 'p2', deletingId: 'p2' })} user={signedIn} firebaseConfigured />);
    expect(screen.getByRole('button', { name: 'Menghapus…' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Batal' }).disabled).toBe(true);
  });

  it('formulir laporan menampilkan keempat alasan dan memanggil submitReport', async () => {
    const user = userEvent.setup();
    const chat = makeChat({ visiblePosts: [othersPost], totalPosts: 1, reportingPostId: 'p1' });
    render(<ChatPanel chat={chat} user={signedIn} firebaseConfigured />);
    const options = within(screen.getByLabelText('Alasan laporan')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Kirim laporan' }));
    expect(chat.submitReport).toHaveBeenCalledTimes(1);
    expect(chat.submitReport.mock.calls[0][1]).toEqual(othersPost);
  });
});

describe('penulisan', () => {
  it('Ctrl+Enter dan Cmd+Enter mengirim; Enter biasa tidak', () => {
    const chat = makeChat({ draft: 'Halo' });
    render(<ChatPanel chat={chat} user={signedIn} firebaseConfigured />);
    const textarea = screen.getByLabelText('Isi obrolan');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(chat.submitPost).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(chat.submitPost).toHaveBeenCalledTimes(2);
  });

  it('penghitung diberi peringatan mendekati batas dan tombol mengikuti keadaan kirim/jeda', () => {
    const { rerender } = render(<ChatPanel chat={makeChat({ draft: 'a'.repeat(1900) })} user={signedIn} firebaseConfigured />);
    expect(screen.getByText('1900/2000').className).toContain('near-limit');
    rerender(<ChatPanel chat={makeChat({ draft: 'abc' })} user={signedIn} firebaseConfigured />);
    expect(screen.getByText('3/2000').className).not.toContain('near-limit');
    rerender(<ChatPanel chat={makeChat({ posting: true })} user={signedIn} firebaseConfigured />);
    expect(screen.getByRole('button', { name: 'Mengirim…' }).disabled).toBe(true);
    rerender(<ChatPanel chat={makeChat({ cooldownRemaining: 7 })} user={signedIn} firebaseConfigured />);
    expect(screen.getByRole('button', { name: /Tunggu 7 dtk/ }).disabled).toBe(true);
  });

  it('filter topik dan kolom pencarian memanggil setter', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatPanel chat={chat} user={null} firebaseConfigured />);
    await user.click(screen.getByRole('button', { name: 'Info Layanan' }));
    expect(chat.setTopic).toHaveBeenCalledWith('Info Layanan');
    await user.type(screen.getByLabelText('Cari obrolan'), 'k');
    expect(chat.setSearch).toHaveBeenCalledWith('k');
  });
});
