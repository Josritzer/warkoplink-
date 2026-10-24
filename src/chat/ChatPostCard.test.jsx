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
    openReplies: vi.fn(), repliesByPost: {}, replyingPostId: '', replyDraft: '', setReplyDraft: vi.fn(),
    handleReply: vi.fn(), handleReportPost: vi.fn(), reporting: false, deleteConfirmId: '',
    setDeleteConfirmId: vi.fn(), deletingPostId: '', handleDeletePost: vi.fn(), ...overrides
  };
}

describe('ChatPostCard', () => {
  it('shows selected reaction and keeps reaction action connected', () => {
    const values = props({ postReactions: { 'post-1': '😂' } });
    render(<ChatPostCard {...values} />);
    expect(screen.getByRole('button', { name: 'Beri reaksi 😂' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Beri reaksi ❤️' }));
    expect(values.handleReactPost).toHaveBeenCalledWith(values.post, '❤️');
  });

  it('offers delete only to the owner and asks for confirmation before deleting', () => {
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
