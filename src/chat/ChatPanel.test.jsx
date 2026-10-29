import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ChatPanel from './ChatPanel.jsx';

describe('ChatPanel warung mentions', () => {
  it('suggests and inserts a verified warung name containing spaces', () => {
    const setDraft = vi.fn();
    render(<ChatPanel
      user={{ uid: 'user-1', displayName: 'Anggota' }}
      firebaseConfigured
      search=""
      setSearch={vi.fn()}
      topic="Semua"
      setTopic={vi.fn()}
      composerTopic="Ngopi Bareng"
      setComposerTopic={vi.fn()}
      composerOpen
      setComposerOpen={vi.fn()}
      openAuth={vi.fn()}
      setNotice={vi.fn()}
      draft="Ngopi bareng @Warkop Po"
      setDraft={setDraft}
      activeCategory="Ngopi Bareng"
      handlePost={vi.fn()}
      posting={false}
      postsStatus="ready"
      setPostsRetry={vi.fn()}
      visiblePosts={[]}
      cardProps={{}}
      hasMorePosts={false}
      loadingMorePosts={false}
      loadMoreError=""
      onLoadMorePosts={vi.fn()}
      verifiedWarungs={[{ id: 'pojok-123', name: 'Warkop Pojok', nameNormalized: 'warkop pojok', address: 'Maduran' }]}
    />);

    const suggestion = screen.getByRole('option', { name: /Warkop Pojok/ });
    fireEvent.click(suggestion);

    expect(setDraft).toHaveBeenCalledTimes(1);
    expect(setDraft.mock.calls[0][0]('Ngopi bareng @Warkop Po')).toBe('Ngopi bareng @Warkop Pojok ');
  });
});
