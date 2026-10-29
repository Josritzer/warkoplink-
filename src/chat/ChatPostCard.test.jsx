import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatPostCard from './ChatPostCard.jsx';

afterEach(() => cleanup());

function props(overrides = {}) {
  const post = { id: 'post-1', authorId: 'user-1', authorName: 'Anggota', body: 'Tes obrolan', topic: 'Obrolan Umum', createdAt: null };
  return {
    post, user: { uid: 'user-1' }, relativePostTime: () => 'baru saja', verifiedWarungs: [], onOpenWarung: vi.fn(),
    openPostMenuId: '', setOpenPostMenuId: vi.fn(), openAuth: vi.fn(), setNotice: vi.fn(),
    reportingPostId: '', setReportingPostId: vi.fn(), reportReason: 'Spam atau promosi berulang',
    setReportReason: vi.fn(), sharePost: vi.fn(), postReactions: {}, handleReactPost: vi.fn(),
    likeCounts: {}, replyCounts: {}, expandedReplies: {}, likedPosts: {}, handleLikePost: vi.fn(),
    openReplies: vi.fn().mockResolvedValue([]), closeReplies: vi.fn(), repliesByPost: {}, replyingPostId: '', replyDraft: '', setReplyDraft: vi.fn(),
    handleReply: vi.fn(), handleReportPost: vi.fn(), reporting: false, deleteConfirmId: '',
    setDeleteConfirmId: vi.fn(), deletingPostId: '', handleDeletePost: vi.fn(), ...overrides
  };
}

describe('ChatPostCard', () => {
  it('memakai inisial, bukan gambar acak eksternal, saat penulis tidak punya foto', () => {
    const { container } = render(<ChatPostCard {...props({ post: { ...props().post, authorName: 'budi' } })} />);
    const avatar = container.querySelector('.post-avatar');
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.textContent).toBe('B');
    expect(container.innerHTML).not.toContain('pravatar');
  });
  it('tetap menampilkan foto profil milik penulis bila ada', () => {
    const { container } = render(<ChatPostCard {...props({ post: { ...props().post, authorPhotoURL: 'https://example.com/a.jpg' } })} />);
    expect(container.querySelector('.post-avatar img').getAttribute('src')).toBe('https://example.com/a.jpg');
  });
  it('links only exact mentions of verified warkops to their permanent profile route', () => {
    const values = props({
      post: { ...props().post, body: 'Ngopi yuk @Warkop Pojok! Bukan @Warkop Lain.' },
      verifiedWarungs: [{ id: 'pojok-123', name: 'Warkop Pojok', nameNormalized: 'warkop pojok' }]
    });
    render(<ChatPostCard {...values} />);
    const mention = screen.getByRole('link', { name: '@Warkop Pojok' });
    expect(mention.getAttribute('href')).toBe('?warung=pojok-123');
    expect(screen.queryByRole('link', { name: '@Warkop Lain' })).toBeNull();
    fireEvent.click(mention);
    expect(values.onOpenWarung).toHaveBeenCalledWith('pojok-123');
  });
  it('renders category labels and structured posting details', () => {
    const values = props({ post: { ...props().post, topic: 'Loker', postType: 'Paruh waktu / shift', location: 'Maduran', workType: 'Shift malam', price: 'Rp50.000' } });
    const { container } = render(<ChatPostCard {...values} />);
    expect(screen.getByText('Loker')).toBeTruthy();
    expect(screen.getByText('Paruh waktu / shift')).toBeTruthy();
    expect(screen.getByText('Maduran')).toBeTruthy();
    expect(screen.getByText('Shift malam')).toBeTruthy();
    expect(container.querySelector('.post-category-loker')).toBeTruthy();
  });

  it('shows old topic labels through compatibility mapping', () => {
    render(<ChatPostCard {...props({ post: { ...props().post, topic: 'Tanya Jawab' } })} />);
    expect(screen.getByText('Tanya Warkop')).toBeTruthy();
  });

  it('hides the reaction summary entirely when total is zero', () => {
    render(<ChatPostCard {...props({
      reactionSummaries: { 'post-1': { reactions: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, totalReactions: 0 } }
    })} />);
    expect(screen.queryByLabelText('Ringkasan reaksi')).toBeNull();
  });

  it('shows only nonzero emoji counts and the total above action buttons', () => {
    const values = props({
      reactionSummaries: { 'post-1': {
        reactions: { like: 1, love: 2, haha: 0, wow: 0, sad: 1, angry: 0 },
        totalReactions: 4
      } }
    });
    render(<ChatPostCard {...values} />);
    const summary = screen.getByLabelText('Ringkasan reaksi');
    expect(summary.textContent).toContain('👍1');
    expect(summary.textContent).toContain('❤️2');
    expect(summary.textContent).toContain('😢1');
    expect(summary.textContent).toContain('4');
    expect(summary.textContent).not.toContain('😂');
    expect(summary.compareDocumentPosition(screen.getByRole('button', { name: 'Reaksi' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the six emoji hidden until the reaction picker is opened', () => {
    const values = props({ postReactions: { 'post-1': '😂' } });
    render(<ChatPostCard {...values} />);
    expect(screen.queryByRole('button', { name: 'Beri reaksi 😂' })).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Reaksi' });
    expect(trigger.textContent).toContain('😂');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Beri reaksi 😂' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Beri reaksi ❤️' }));
    expect(values.handleReactPost).toHaveBeenCalledWith(values.post, '❤️');
    expect(screen.queryByRole('button', { name: 'Beri reaksi ❤️' })).toBeNull();
  });

  it('opens the dedicated reply page when tapping the comment count', () => {
    const values = props({ replyCounts: { 'post-1': 3 }, openReplyPage: vi.fn().mockResolvedValue(undefined) });
    render(<ChatPostCard {...values} />);
    expect(screen.queryByLabelText('Komentar dan balasan')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Tulis komentar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /3 komentar/ }));
    expect(values.openReplyPage).toHaveBeenCalledWith(values.post);
  });

  it('Balas opens the dedicated reply page', () => {
    const values = props({ openReplyPage: vi.fn().mockResolvedValue(undefined) });
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: 'Balas' }));
    expect(values.openReplyPage).toHaveBeenCalledWith(values.post);
    expect(screen.queryByRole('textbox', { name: 'Tulis komentar' })).toBeNull();
  });

  // Regresi: `repliesByPost[post.id] || []` menghasilkan array baru di tiap render, sehingga efek
  // sinkronisasi komentar memanggil setComments([]) tanpa henti (tes macet / OOM, CPU 100% di browser).
  // Pencacah melempar error agar kegagalan muncul cepat, bukan menggantung.
  function renderCounter(limit) {
    const counter = { renders: 0 };
    counter.relativePostTime = () => {
      counter.renders += 1;
      if (counter.renders > limit) throw new Error('ChatPostCard render loop terdeteksi');
      return 'baru saja';
    };
    return counter;
  }

  it('does not re-render endlessly for a post with no loaded replies', () => {
    const counter = renderCounter(25);
    render(<ChatPostCard {...props({ relativePostTime: counter.relativePostTime, repliesByPost: {} })} />);
    expect(counter.renders).toBeLessThanOrEqual(3);
  });

  it('keeps render count bounded when opening the dedicated reply page', () => {
    const counter = renderCounter(60);
    const values = props({
      relativePostTime: counter.relativePostTime,
      replyCounts: { 'post-1': 1 },
      openReplyPage: vi.fn().mockResolvedValue(undefined)
    });
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: /1 komentar/ }));
    expect(values.openReplyPage).toHaveBeenCalledWith(values.post);
    expect(screen.queryByLabelText('Komentar dan balasan')).toBeNull();
    expect(counter.renders).toBeLessThanOrEqual(30);
  });

  it('asks for confirmation before invoking deletion', () => {
    const values = props({ deleteConfirmId: 'post-1' });
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ya, hapus' }));
    expect(values.handleDeletePost).toHaveBeenCalledWith(values.post);
  });

  it('offers the delete action only to the owner', async () => {
    const values = props({ openPostMenuId: 'post-1' });
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: 'Opsi postingan' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Hapus obrolan/ }));
    expect(values.setDeleteConfirmId).toHaveBeenCalledWith('post-1');
  });

  it('does not offer delete to another user', async () => {
    render(<ChatPostCard {...props({ user: { uid: 'someone-else' }, openPostMenuId: 'post-1' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Opsi postingan' }));
    expect(screen.queryByRole('menuitem', { name: /Hapus obrolan/ })).toBeNull();
    expect(await screen.findByRole('menuitem', { name: /Laporkan obrolan/ })).toBeTruthy();
  });
});

describe('ChatPostCard — tampilan 2026', () => {
  it('menampilkan enam reaksi utama dan menyembunyikan emoji lain di balik tombol tambahan', () => {
    render(<ChatPostCard {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reaksi' }));
    for (const emoji of ['👍', '❤️', '😂', '😮', '😢', '😡']) {
      expect(screen.getByRole('button', { name: `Beri reaksi ${emoji}` })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Beri reaksi 🥳' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan reaksi lainnya' }));
    expect(screen.getByRole('button', { name: 'Beri reaksi 🥳' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sembunyikan reaksi lainnya' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('memilih emoji tambahan tetap mengirim reaksi dan menutup pemilih', () => {
    const values = props();
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reaksi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan reaksi lainnya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Beri reaksi 🥳' }));
    expect(values.handleReactPost).toHaveBeenCalledWith(values.post, '🥳');
    expect(screen.queryByRole('group', { name: 'Pilih reaksi' })).toBeNull();
  });

  it('tidak menampilkan jumlah reaksi ganda dan memakai satu baris ringkasan', () => {
    const values = props({
      replyCounts: { 'post-1': 2 },
      reactionSummaries: { 'post-1': { reactions: { like: 3, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, totalReactions: 3 } }
    });
    const { container } = render(<ChatPostCard {...values} />);
    expect(screen.queryByText('3 reaksi')).toBeNull();
    expect(container.querySelectorAll('.post-stats')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /2 komentar/ })).toBeTruthy();
  });

  it('menampilkan teks netral saat belum ada komentar', () => {
    render(<ChatPostCard {...props()} />);
    expect(screen.getByRole('button', { name: /0 komentar/ }).textContent).toBe('Belum ada komentar');
  });
});
