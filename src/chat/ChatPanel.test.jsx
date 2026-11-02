import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatPanel from './ChatPanel.jsx';
const mentionFirestore = vi.hoisted(() => ({ getDocs: vi.fn(), getDoc: vi.fn() }));

afterEach(() => cleanup());
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, path) => ({ path })),
  doc: vi.fn((db, collectionName, id) => ({ path: `${collectionName}/${id}` })),
  endAt: vi.fn(value => ({ endAt: value })),
  getDoc: mentionFirestore.getDoc,
  getDocs: mentionFirestore.getDocs,
  limit: vi.fn(value => ({ limit: value })),
  orderBy: vi.fn(value => ({ orderBy: value })),
  query: vi.fn((...args) => ({ args })),
  startAt: vi.fn(value => ({ startAt: value }))
}));

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

  it('suggests registered members after punctuation and inserts the selected username', async () => {
    mentionFirestore.getDocs.mockResolvedValue({
      docs: [{ id: 'kopi_senja', data: () => ({ uid: 'user-2', username: 'kopi_senja' }) }]
    });
    mentionFirestore.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: 'Kopi Senja' })
    });
    const setDraft = vi.fn();
    render(<ChatPanel
      user={{ uid: 'user-1', displayName: 'Anggota' }} db={{ name: 'db' }}
      firebaseConfigured search="" setSearch={vi.fn()} topic="Semua" setTopic={vi.fn()}
      composerTopic="Ngopi Bareng" setComposerTopic={vi.fn()} composerOpen
      setComposerOpen={vi.fn()} openAuth={vi.fn()} setNotice={vi.fn()}
      draft="Halo, @kop" setDraft={setDraft} activeCategory="Ngopi Bareng"
      handlePost={vi.fn()} posting={false} postsStatus="ready" setPostsRetry={vi.fn()}
      visiblePosts={[]} cardProps={{}} hasMorePosts={false} loadingMorePosts={false}
      loadMoreError="" onLoadMorePosts={vi.fn()} verifiedWarungs={[]}
    />);
    const option = await screen.findByRole('option', { name: /Kopi Senja.*@kopi_senja/ });
    fireEvent.click(option);
    expect(setDraft).toHaveBeenCalledTimes(1);
    expect(setDraft.mock.calls[0][0]('Halo, @kop')).toBe('Halo, @kopi_senja ');
  });

});


describe('community group posting access', () => {
  const sharedProps = {
    user: { uid: 'user-1', displayName: 'Anggota' },
    firebaseConfigured: true,
    search: '', setSearch: vi.fn(), topic: 'Semua', setTopic: vi.fn(),
    composerTopic: 'Ngopi Bareng', setComposerTopic: vi.fn(),
    composerOpen: false, setComposerOpen: vi.fn(), openAuth: vi.fn(), setNotice: vi.fn(),
    draft: '', setDraft: vi.fn(), activeCategory: 'Ngopi Bareng',
    handlePost: vi.fn(), posting: false, postsStatus: 'ready', setPostsRetry: vi.fn(),
    visiblePosts: [], cardProps: {}, hasMorePosts: false, loadingMorePosts: false,
    loadMoreError: '', onLoadMorePosts: vi.fn(), verifiedWarungs: []
  };

  it('keeps group discussions readable but hides the composer until the user joins', () => {
    render(<ChatPanel {...sharedProps} communityId="ngopi-bareng" communityMember={false}/>);
    expect(screen.getByText(/Ruang diskusi terbuka untuk dibaca/)).toBeTruthy();
    expect(screen.getByText(/Gabung komunitas untuk mulai membuat postingan/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ayo ngobrol/ })).toBeNull();
  });

  it('shows the composer after membership becomes active', () => {
    render(<ChatPanel {...sharedProps} communityId="ngopi-bareng" communityMember/>);
    expect(screen.getByRole('button', { name: /Ayo ngobrol/ })).toBeTruthy();
    expect(screen.queryByText(/Gabung komunitas untuk mulai membuat postingan/)).toBeNull();
  });

  it('locks the posting category to the selected official community', async () => {
    const setComposerTopic = vi.fn();
    render(<ChatPanel {...sharedProps} setComposerTopic={setComposerTopic} composerOpen communityId="jasa-lokal" communityMember/>);
    await waitFor(() => expect(setComposerTopic).toHaveBeenCalledWith('Jasa Lokal'));
    expect(screen.getByText('Postingan ini otomatis masuk ke komunitas Jasa Lokal.')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Kategori posting' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Jenis posting' })).toBeTruthy();
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
      previewMode
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
    // Scope assertions to this render; screen queries can match DOM left by another render.
    expect(container.querySelector('[aria-label="Kategori obrolan"]')).toBeNull();
    expect(container.textContent).toContain('Beranda · cuplikan 3 obrolan terbaru');
    expect(container.querySelector('h2')?.textContent).toBe('Suasana komunitas');
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
  it('menyediakan pilihan warkop milik sendiri, pratinjau, dan meneruskan file saat dikirim', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:poster-preview');
    try {
      const handlePost = vi.fn().mockResolvedValue(true);
      const { container } = render(<ChatPanel
        user={{ uid: 'owner-1', displayName: 'Pemilik' }}
        firebaseConfigured
        search="" setSearch={vi.fn()} topic="Semua" setTopic={vi.fn()}
        composerTopic="Info & Acara" setComposerTopic={vi.fn()} composerOpen
        setComposerOpen={vi.fn()} openAuth={vi.fn()} setNotice={vi.fn()}
        draft="Nobar final" setDraft={vi.fn()} activeCategory="Info & Acara"
        handlePost={handlePost} posting={false} postsStatus="ready" setPostsRetry={vi.fn()}
        visiblePosts={[]} cardProps={{}} hasMorePosts={false} loadingMorePosts={false}
        loadMoreError="" onLoadMorePosts={vi.fn()} verifiedWarungs={[]}
        ownVerifiedWarungs={[{ id: 'warung-1', name: 'Warkop Pojok' }]}
      />);
      const file = new File(['poster'], 'poster.jpg', { type: 'image/jpeg' });
      fireEvent.change(screen.getByLabelText(/Poster acara/), { target: { files: [file] } });
      fireEvent.change(screen.getByRole('combobox', { name: 'Warkop penyelenggara' }), { target: { value: 'warung-1' } });
      expect(screen.getByRole('option', { name: 'Warkop Pojok' })).toBeTruthy();
      await waitFor(() => expect(container.querySelector('.event-poster-preview img')?.getAttribute('src')).toBe('blob:poster-preview'));
      expect(screen.getByText('poster.jpg')).toBeTruthy();
      fireEvent.submit(container.querySelector('form'));
      await waitFor(() => expect(handlePost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventPosterFile: file, eventWarungId: 'warung-1' })));
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
