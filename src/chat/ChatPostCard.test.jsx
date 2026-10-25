import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatPostCard from './ChatPostCard.jsx';

afterEach(() => cleanup());

function props(overrides = {}) {
  const post = { id: 'post-1', authorId: 'user-1', authorName: 'Anggota', body: 'Tes obrolan', topic: 'Obrolan Umum', createdAt: null };
  return {
    post, user: { uid: 'user-1' }, relativePostTime: () => 'baru saja',
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
    fireEvent.click(screen.getByRole('button', { name: '3 komentar' }));
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
    fireEvent.click(screen.getByRole('button', { name: '1 komentar' }));
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
