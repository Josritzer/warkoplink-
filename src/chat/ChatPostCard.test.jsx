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

  it('keeps comments hidden by default and fetches only after tapping the count', async () => {
    const values = props({
      replyCounts: { 'post-1': 3 },
      openReplies: vi.fn().mockResolvedValue([
        { id: 'comment-1', authorName: 'Budi', body: 'Iya saya di sini' }
      ])
    });
    render(<ChatPostCard {...values} />);
    expect(screen.queryByLabelText('Komentar dan balasan')).toBeNull();
    expect(values.openReplies).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '3 komentar' }));
    expect(await screen.findByText('Iya saya di sini')).toBeTruthy();
    expect(values.openReplies).toHaveBeenCalledWith(values.post);
    expect(screen.getByRole('textbox', { name: 'Tulis komentar' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '3 komentar' }));
    expect(screen.queryByLabelText('Komentar dan balasan')).toBeNull();
    expect(values.closeReplies).toHaveBeenCalledWith(values.post);
  });

  it('Balas opens the comment panel and focuses the comment input', async () => {
    const values = props();
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: 'Balas' }));
    expect(await screen.findByRole('textbox', { name: 'Tulis komentar' })).toBeTruthy();
    expect(values.openReplies).toHaveBeenCalledWith(values.post);
  });

  it('asks for confirmation before invoking deletion', () => {
    const values = props({ deleteConfirmId: 'post-1' });
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ya, hapus' }));
    expect(values.handleDeletePost).toHaveBeenCalledWith(values.post);
  });

  it('offers the delete action only to the owner', () => {
    const values = props({ openPostMenuId: 'post-1' });
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus obrolan' }));
    expect(values.setDeleteConfirmId).toHaveBeenCalledWith('post-1');
  });

  it('does not offer delete to another user', () => {
    render(<ChatPostCard {...props({ user: { uid: 'someone-else' }, openPostMenuId: 'post-1' })} />);
    expect(screen.queryByRole('button', { name: /Hapus obrolan/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Laporkan obrolan/ })).toBeTruthy();
  });
});
