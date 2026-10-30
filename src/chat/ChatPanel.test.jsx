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


describe('ChatPanel homepage layout', () => {
  it('omits the three story prompts and the auto-sliding story carousel', () => {
    const { container } = render(<ChatPanel
      user={null}
      firebaseConfigured
      search=""
      setSearch={vi.fn()}
      topic="Semua"
      setTopic={vi.fn()}
      composerTopic="Ngopi Bareng"
      setComposerTopic={vi.fn()}
      composerOpen={false}
      setComposerOpen={vi.fn()}
      readOnly
      onOpenDiscussion={vi.fn()}
      onOpenDirectory={vi.fn()}
      openAuth={vi.fn()}
      setNotice={vi.fn()}
      draft=""
      setDraft={vi.fn()}
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
      verifiedWarungs={[]}
    />);

    expect(container.querySelector('.community-story-strip')).toBeNull();
    expect(container.querySelector('.warkop-stories')).toBeNull();
    expect(screen.getAllByLabelText('Kategori obrolan').length).toBeGreaterThan(0);
    expect(screen.getByText('Beranda · mode baca')).toBeTruthy();
  });
});


describe('ChatPanel visual cleanup', () => {
  it('uses the WarkopLink brand accent instead of orange and avoids a plus affordance', () => {
    const { container } = render(<ChatPanel
      user={null}
      firebaseConfigured
      search=""
      setSearch={vi.fn()}
      topic="Semua"
      setTopic={vi.fn()}
      composerTopic="Ngopi Bareng"
      setComposerTopic={vi.fn()}
      composerOpen={false}
      setComposerOpen={vi.fn()}
      openAuth={vi.fn()}
      setNotice={vi.fn()}
      draft=""
      setDraft={vi.fn()}
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
      verifiedWarungs={[]}
    />);

    const illustration = container.querySelector('.empty-illustration');
    expect(illustration.querySelector('path:last-child').getAttribute('fill')).toBe('var(--wl-primary)');
    const startButton = container.querySelector('.empty-state-community .event-action-row .button-dark');
    expect(startButton.textContent).toContain('Mulai obrolan');
    expect(startButton.querySelector('svg')?.classList.contains('lucide-message-circle')).toBe(true);
  });
});


describe('poster Info & Acara', () => {
  it('menyediakan pilihan warkop milik sendiri dan pratinjau poster sebelum dikirim', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:poster-preview');
    try {
      const { container } = render(<ChatPanel
        user={{ uid: 'owner-1', displayName: 'Pemilik' }}
        firebaseConfigured
        search="" setSearch={vi.fn()} topic="Semua" setTopic={vi.fn()}
        composerTopic="Info & Acara" setComposerTopic={vi.fn()} composerOpen
        setComposerOpen={vi.fn()} openAuth={vi.fn()} setNotice={vi.fn()}
        draft="Nobar final" setDraft={vi.fn()} activeCategory="Info & Acara"
        handlePost={vi.fn()} posting={false} postsStatus="ready" setPostsRetry={vi.fn()}
        visiblePosts={[]} cardProps={{}} hasMorePosts={false} loadingMorePosts={false}
        loadMoreError="" onLoadMorePosts={vi.fn()} verifiedWarungs={[]}
        ownVerifiedWarungs={[{ id: 'warung-1', name: 'Warkop Pojok' }]}
      />);
      const file = new File(['poster'], 'poster.jpg', { type: 'image/jpeg' });
      fireEvent.change(screen.getByLabelText(/Poster acara/), { target: { files: [file] } });
      expect(screen.getByRole('combobox', { name: 'Warkop penyelenggara' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Warkop Pojok' })).toBeTruthy();
      expect(container.querySelector('.event-poster-preview img')?.getAttribute('src')).toBe('blob:poster-preview');
      expect(screen.getByText('poster.jpg')).toBeTruthy();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
