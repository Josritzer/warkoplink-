import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatPostCard from './ChatPostCard.jsx';

const firestoreMocks = vi.hoisted(() => ({ setDoc: vi.fn(), deleteDoc: vi.fn(), onSnapshot: vi.fn(), getDocs: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args) => ({ path: args.slice(1).join('/'), kind: 'collection' })),
  deleteDoc: firestoreMocks.deleteDoc,
  documentId: vi.fn(() => '__name__'),
  getDocs: firestoreMocks.getDocs,
  limit: vi.fn(value => ({ limit: value })),
  doc: vi.fn((...args) => ({ path: args.slice(1).join('/'), kind: 'document' })),
  onSnapshot: firestoreMocks.onSnapshot,
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  query: vi.fn((...args) => ({ path: args[0]?.path, kind: 'query' })),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  startAfter: vi.fn(value => ({ startAfter: value })),
  setDoc: firestoreMocks.setDoc,
  where: vi.fn((...args) => ({ where: args }))
}));
vi.mock('../firebase.js', () => ({ db: { name: 'test-db' } }));

beforeEach(() => {
  firestoreMocks.setDoc.mockReset().mockResolvedValue(undefined);
  firestoreMocks.deleteDoc.mockReset().mockResolvedValue(undefined);
  firestoreMocks.getDocs.mockReset().mockResolvedValue({ docs: [] });
  firestoreMocks.onSnapshot.mockReset().mockImplementation((ref, next) => {
    if (ref?.kind === 'query') next({ size: 0, docs: [] });
    else next({ exists: () => false, data: () => ({}) });
    return vi.fn();
  });
});

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
  it('opens the author profile from the avatar and author name', () => {
    const values = props({ onOpenProfile: vi.fn() });
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lihat profil Anggota' }));
    expect(values.onOpenProfile).toHaveBeenCalledWith({ uid: 'user-1', displayName: 'Anggota', photoURL: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Anggota' }));
    expect(values.onOpenProfile).toHaveBeenCalledTimes(2);
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

  it('does not repeat the main category as a second official-community label', () => {
    const { container } = render(<ChatPostCard {...props({ post: { ...props().post, communityId: 'ngopi-bareng' } })} />);
    expect(container.querySelectorAll('.post-category-label')).toHaveLength(1);
    expect(container.querySelectorAll('.post-community-label')).toHaveLength(0);
    expect(screen.getByText('Ngopi Bareng', { selector: '.post-category-label' })).toBeTruthy();
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

  it('shows a single like action and the actual like count without emoji summary', () => {
    const values = props({
      reactionSummaries: { 'post-1': {
        reactions: { like: 1, love: 2, haha: 0, wow: 0, sad: 1, angry: 0 },
        totalReactions: 4
      } },
      likedPosts: { 'post-1': false }
    });
    render(<ChatPostCard {...values} />);
    expect(screen.getByRole('button', { name: 'Sukai postingan' })).toBeTruthy();
    expect(screen.queryByLabelText('Ringkasan reaksi')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reaksi' })).toBeNull();
    expect(screen.getByRole('button', { name: '4 suka' })).toBeTruthy();
  });

  it('shows Suka / Disukai and delegates the action to the like handler', () => {
    const values = props({ likedPosts: { 'post-1': true } });
    render(<ChatPostCard {...values} />);
    const trigger = screen.getByRole('button', { name: 'Batalkan suka pada postingan' });
    expect(trigger.textContent).toContain('Disukai');
    expect(trigger.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(trigger);
    expect(values.handleLikePost).toHaveBeenCalledWith(values.post);
    expect(screen.queryByRole('button', { name: 'Reaksi' })).toBeNull();
  });

  it('uses one accessible Komentar action with the count and opens the dedicated thread', () => {
    const values = props({ replyCounts: { 'post-1': 3 }, openReplyPage: vi.fn().mockResolvedValue(undefined) });
    const { container } = render(<ChatPostCard {...values} />);
    expect(screen.getByRole('button', { name: 'Komentar, 3' })).toBeTruthy();
    expect(container.querySelectorAll('.engagement-comment-count')).toHaveLength(0);
    expect(screen.getAllByText('Komentar')).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: 'Tulis komentar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Komentar, 3' }));
    expect(values.openReplyPage).toHaveBeenCalledWith(values.post);
  });

  it('Balas opens the thread with the reply composer focused', () => {
    const values = props({ openReplyPage: vi.fn().mockResolvedValue(undefined) });
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: 'Balas' }));
    expect(values.openReplyPage).toHaveBeenCalledWith(values.post, { focusComposer: true });
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
    fireEvent.click(screen.getByRole('button', { name: 'Komentar, 1' }));
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


  it('menampilkan status menyimpan dan mengunci RSVP sampai Firestore mengonfirmasi', async () => {
    let resolveRsvp;
    firestoreMocks.setDoc.mockImplementationOnce(() => new Promise(resolve => { resolveRsvp = resolve; }));
    render(<ChatPostCard {...props({
      post: { ...props().post, topic: 'Info & Acara', eventStartAt: '2099-06-20T12:00:00.000Z' }
    })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ikut acara' }));
    const pendingButtons = screen.getAllByRole('button', { name: 'Menyimpan…' });
    expect(pendingButtons).toHaveLength(2);
    expect(pendingButtons.every(button => button.disabled)).toBe(true);
    expect(pendingButtons.every(button => button.getAttribute('aria-busy') === 'true')).toBe(true);
    expect(screen.getAllByRole('status').some(status => status.textContent.includes('Menyimpan kehadiran'))).toBe(true);
    await act(async () => { resolveRsvp(); });
    expect(screen.getByRole('button', { name: 'Ikut acara' }).disabled).toBe(false);
  });


  it('mengunci RSVP terhadap klik ganda', async () => {
    let resolveRsvp;
    firestoreMocks.setDoc.mockImplementationOnce(() => new Promise(resolve => { resolveRsvp = resolve; }));
    const values = props({ post: { ...props().post, topic: 'Info & Acara', eventStartAt: '2099-06-20T12:00:00.000Z' } });
    render(<ChatPostCard {...values} />);
    const button = screen.getByRole('button', { name: 'Ikut acara' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(firestoreMocks.setDoc).toHaveBeenCalledOnce();
    await act(async () => { resolveRsvp(); });
  });

  it('shows the saved going state and attendee count when RSVP data is available', () => {
    const values = props({ post: { ...props().post, topic: 'Info & Acara', eventStartAt: '2099-06-20T12:00:00.000Z' } });
    firestoreMocks.onSnapshot.mockImplementation((ref, next) => {
      if (ref?.kind === 'document' && ref.path.endsWith('/eventRsvps/user-1')) next({ exists: () => true, data: () => ({ status: 'going' }) });
      else if (ref?.kind === 'query') next({ size: 2, docs: [] });
      else next({ exists: () => false, data: () => ({}) });
      return vi.fn();
    });
    render(<ChatPostCard {...values} />);
    const going = screen.getByRole('button', { name: '✓ Anda ikut' });
    expect(going.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('2 ikut')).toBeTruthy();
  });

  it('shows a clear failure notice when RSVP cannot be saved', async () => {
    const values = props({ post: { ...props().post, topic: 'Info & Acara', eventStartAt: '2099-06-20T12:00:00.000Z' } });
    firestoreMocks.setDoc.mockRejectedValueOnce(new Error('offline'));
    render(<ChatPostCard {...values} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ikut acara' }));
    await waitFor(() => expect(values.setNotice).toHaveBeenCalledWith('Status kehadiran belum tersimpan. Coba lagi.'));
  });

  it('menandai acara lampau sebagai selesai dan menonaktifkan RSVP', () => {
    render(<ChatPostCard {...props({
      post: { ...props().post, topic: 'Info & Acara', eventStartAt: '2000-06-20T12:00:00.000Z', eventEndAt: '2000-06-20T14:00:00.000Z' }
    })} />);
    expect(screen.getByText('Acara selesai')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ikut acara' })).toBeNull();
  });

  it('menampilkan poster acara yang sudah tersimpan pada postingan Info & Acara', () => {
    const { container } = render(<ChatPostCard {...props({
      post: { ...props().post, topic: 'Info & Acara', eventKind: 'Nobar', eventPhotoURL: 'https://media.example.test/events/post-1/poster.webp' }
    })} />);
    const poster = container.querySelector('.event-post-image img');
    expect(poster?.getAttribute('src')).toBe('https://media.example.test/events/post-1/poster.webp');
    expect(poster?.getAttribute('alt')).toBe('Poster acara Nobar');
  });

  it('menampilkan nama, foto, dan tautan profil warkop penyelenggara acara', () => {
    const values = props({
      post: { ...props().post, topic: 'Info & Acara', warungId: 'warung-1' },
      verifiedWarungs: [{ id: 'warung-1', name: 'Warkop Pojok', photos: ['https://media.example/warung.webp'] }]
    });
    const { container } = render(<ChatPostCard {...values} />);
    expect(screen.getByText('Warkop Pojok')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lihat profil warkop Warkop Pojok' })).toBeTruthy();
    expect(container.querySelector('.event-organizer-avatar img')?.getAttribute('src')).toBe('https://media.example/warung.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Lihat profil warkop Warkop Pojok' }));
    expect(values.onOpenWarung).toHaveBeenCalledWith('warung-1');
  });


  it('opens the mentioned member profile from a username mention', () => {
    const onOpenMention = vi.fn();
    render(<ChatPostCard {...props({
      post: { ...props().post, body: 'Halo @kopi_senja, ayo ngopi!' },
      onOpenMention
    })} />);
    fireEvent.click(screen.getByRole('button', { name: '@kopi_senja' }));
    expect(onOpenMention).toHaveBeenCalledWith('kopi_senja');
  });

});

describe('ChatPostCard — tampilan 2026', () => {
  it('does not expose the old emoji reaction picker after the Suka redesign', () => {
    render(<ChatPostCard {...props()} />);
    expect(screen.getByRole('button', { name: 'Sukai postingan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reaksi' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Pilih reaksi' })).toBeNull();
  });

  it('tidak menampilkan jumlah reaksi ganda dan memakai satu baris ringkasan', () => {
    const values = props({
      replyCounts: { 'post-1': 2 },
      reactionSummaries: { 'post-1': { reactions: { like: 3, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, totalReactions: 3 } }
    });
    const { container } = render(<ChatPostCard {...values} />);
    expect(screen.queryByText('3 reaksi')).toBeNull();
    expect(container.querySelectorAll('.post-actions > .post-action-wrap')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Komentar, 2' })).toBeTruthy();
  });

  it('renders one compact icon row and preserves like, comment, reply, and share actions', () => {
    const values = props({
      likeCounts: { 'post-1': 12 },
      replyCounts: { 'post-1': 0 },
      openReplyPage: vi.fn().mockResolvedValue(undefined)
    });
    const { container } = render(<ChatPostCard {...values} />);
    const actions = container.querySelector('.post-actions');
    expect(actions.getAttribute('aria-label')).toBe('Aksi postingan');
    expect(actions.querySelectorAll(':scope > .post-action-wrap')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Sukai postingan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Komentar, 0' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Balas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bagikan postingan/ })).toBeTruthy();
    expect(actions.textContent).not.toMatch(/Disukai|Suka|Komentar|Bagikan/);
    expect(container.querySelectorAll('.engagement-comment-count')).toHaveLength(0);
  });

  it('preserves intrinsic video orientation instead of forcing a landscape ratio', () => {
    const { container } = render(<ChatPostCard {...props({
      post: { ...props().post, videoURL: 'https://example.com/portrait.mp4' }
    })} />);
    const video = container.querySelector('.feed-video-frame video');
    expect(video.style.aspectRatio).toBe('auto');
    expect(video.getAttribute('data-orientation')).toBeNull();
    expect(container.querySelector('.feed-video-frame')).toBeTruthy();
  });

  it('shows Putar, Jeda, and Putar ulang with matching playback status', async () => {
    const { container } = render(<ChatPostCard {...props({
      post: { ...props().post, videoURL: 'https://example.com/video.mp4' }
    })} />);
    const video = container.querySelector('.feed-video-frame video');
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    Object.defineProperty(video, 'play', { configurable: true, value: play });
    Object.defineProperty(video, 'pause', { configurable: true, value: pause });

    expect(screen.getByRole('button', { name: 'Putar video' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Dijeda');
    fireEvent.click(screen.getByRole('button', { name: 'Putar video' }));
    expect(play).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jeda video' })).toBeTruthy());
    expect(screen.getByRole('status').textContent).toBe('Sedang diputar');

    fireEvent.pause(video);
    expect(screen.getByRole('button', { name: 'Putar video' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Dijeda');
    fireEvent.play(video);
    expect(screen.getByRole('button', { name: 'Jeda video' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Sedang diputar');

    fireEvent.ended(video);
    expect(screen.getByRole('button', { name: 'Putar ulang video' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Video selesai');
    fireEvent.click(screen.getByRole('button', { name: 'Putar ulang video' }));
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('does not autoplay feed videos and defers loading until the user presses play', () => {
    const originalObserver = globalThis.IntersectionObserver;
    const observer = vi.fn(function (callback) {
      this.observe = element => callback([{ isIntersecting: true, intersectionRatio: 1, target: element }]);
      this.disconnect = vi.fn();
    });
    globalThis.IntersectionObserver = observer;
    try {
      const { container } = render(<ChatPostCard {...props({
        post: { ...props().post, videoURL: 'https://example.com/video.mp4' }
      })} />);
      const video = container.querySelector('.feed-video-frame video');
      expect(video).toBeTruthy();
      expect(video.getAttribute('preload')).toBe('none');
      expect(video.controls).toBe(false);
      expect(video.autoplay).toBe(false);
      expect(observer).not.toHaveBeenCalled();
    } finally {
      if (originalObserver === undefined) delete globalThis.IntersectionObserver;
      else globalThis.IntersectionObserver = originalObserver;
    }
  });

});