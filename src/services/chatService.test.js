// Tes lapisan layanan dengan Firebase di-mock (BUKAN ke Firebase asli).
// Memastikan bentuk data yang ditulis sama dengan yang dituntut firestore.rules.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ path: name })),
  deleteDoc: vi.fn(),
  doc: vi.fn((db, col, id) => ({ path: id === undefined && col === undefined && db?.path ? `${db.path}/new-post` : `${col}/${id}` })),
  limit: vi.fn((n) => ({ limit: n })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  query: vi.fn((...args) => ({ args })),
  serverTimestamp: vi.fn(() => '__TS__'),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

import * as fs from 'firebase/firestore';
import { deletePost, publishPost, reportPost, subscribeToPosts } from './chatService.js';

const db = { name: 'db' };
const user = { uid: 'u1', email: 'sari@example.test', displayName: 'Sari' };

beforeEach(() => vi.clearAllMocks());

describe('subscribeToPosts', () => {
  it('meminta obrolan terbaru terbatas 100 dan memetakan dokumen menjadi data dengan id', () => {
    const unsubscribe = vi.fn();
    let next;
    fs.onSnapshot.mockImplementation((q, onNext) => { next = onNext; return unsubscribe; });
    const onData = vi.fn();
    const onError = vi.fn();

    const stop = subscribeToPosts(db, onData, onError);

    expect(fs.collection).toHaveBeenCalledWith(db, 'posts');
    expect(fs.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(fs.limit).toHaveBeenCalledWith(100);
    expect(fs.onSnapshot.mock.calls[0][2]).toBe(onError);
    next({ docs: [{ id: 'p1', data: () => ({ body: 'Halo' }) }, { id: 'p2', data: () => ({ body: 'Hai' }) }] });
    expect(onData).toHaveBeenCalledWith([{ id: 'p1', body: 'Halo' }, { id: 'p2', body: 'Hai' }]);
    expect(stop).toBe(unsubscribe);
  });
});

describe('publishPost', () => {
  it('menulis obrolan dan penanda jeda dalam satu batch atomik', async () => {
    const batch = { set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    fs.writeBatch.mockReturnValue(batch);

    await publishPost(db, user, { body: 'Halo komunitas', topic: 'Tanya Jawab' });

    expect(fs.writeBatch).toHaveBeenCalledTimes(1);
    expect(batch.set).toHaveBeenNthCalledWith(1, { path: 'posts/new-post' }, {
      authorId: 'u1', authorName: 'Sari', body: 'Halo komunitas', topic: 'Tanya Jawab', createdAt: '__TS__',
    });
    expect(batch.set).toHaveBeenNthCalledWith(2, { path: 'postRateLimits/u1' }, { uid: 'u1', lastSentAt: '__TS__' });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('nama penulis tidak pernah memakai email dan error batch diteruskan ke pemanggil', async () => {
    const batch = { set: vi.fn(), commit: vi.fn().mockRejectedValue({ code: 'permission-denied' }) };
    fs.writeBatch.mockReturnValue(batch);

    await expect(publishPost(db, { uid: 'u2', email: 'rahasia@example.test', displayName: null }, { body: 'Halo', topic: 'Obrolan Umum' }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(JSON.stringify(batch.set.mock.calls[0][1])).not.toContain('rahasia');
    expect(batch.set.mock.calls[0][1].authorName).toBe('Anggota');
  });
});

describe('deletePost', () => {
  it('menghapus dokumen obrolan berdasarkan id', async () => {
    fs.deleteDoc.mockResolvedValue(undefined);
    await deletePost(db, 'p1');
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: 'posts/p1' });
  });
});

describe('reportPost', () => {
  it('memakai id deterministik satu laporan per akun per obrolan', async () => {
    fs.setDoc.mockResolvedValue(undefined);
    await reportPost(db, user, { id: 'p9', authorId: 'u7' }, 'Lainnya');
    expect(fs.setDoc).toHaveBeenCalledWith({ path: 'postReports/p9_u1' }, {
      targetPostId: 'p9', targetAuthorId: 'u7', reporterUid: 'u1', reason: 'Lainnya', createdAt: '__TS__',
    });
  });
});
