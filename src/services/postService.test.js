import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, ...segments) => ({ path: segments.join('/') })),
  deleteDoc: vi.fn(),
  doc: vi.fn((db, col, id) => ({ path: `${col}/${id}` })),
  getDocs: vi.fn(),
  limit: vi.fn((n) => ({ limit: n })),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

import * as fs from 'firebase/firestore';
import { deleteOwnPost } from './postService.js';

const docsOf = (count, prefix) => Array.from({ length: count }, (_, index) => ({ ref: { path: `${prefix}/${index}` } }));

describe('deleteOwnPost', () => {
  let batches;

  beforeEach(() => {
    vi.clearAllMocks();
    batches = [];
    fs.updateDoc.mockResolvedValue(undefined);
    fs.deleteDoc.mockResolvedValue(undefined);
    fs.writeBatch.mockImplementation(() => {
      const batch = { delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
      batches.push(batch);
      return batch;
    });
  });

  it('menandai deleting lebih dulu, membaca subkoleksi per batch dengan limit, lalu menghapus postingan', async () => {
    fs.getDocs
      .mockResolvedValueOnce({ empty: false, docs: docsOf(450, 'likes') })
      .mockResolvedValueOnce({ empty: false, docs: docsOf(10, 'likes') })
      .mockResolvedValueOnce({ empty: true, docs: [] })
      .mockResolvedValueOnce({ empty: true, docs: [] });

    await deleteOwnPost({ name: 'db' }, 'p1');

    expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'posts/p1' }, { deleting: true });
    expect(fs.updateDoc.mock.invocationCallOrder[0]).toBeLessThan(fs.getDocs.mock.invocationCallOrder[0]);

    // Setiap pembacaan wajib berbatas; tidak boleh membaca seluruh subkoleksi sekaligus.
    expect(fs.getDocs).toHaveBeenCalledTimes(4);
    fs.getDocs.mock.calls.forEach(([queryArg]) => {
      expect(queryArg.constraints).toEqual([{ limit: 450 }]);
    });

    expect(batches).toHaveLength(2);
    expect(batches[0].delete).toHaveBeenCalledTimes(450);
    expect(batches[1].delete).toHaveBeenCalledTimes(10);
    batches.forEach((batch) => expect(batch.commit).toHaveBeenCalledTimes(1));

    expect(fs.deleteDoc).toHaveBeenCalledTimes(1);
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: 'posts/p1' });
  });

  it('menolak bila referensi postingan tidak ada', async () => {
    await expect(deleteOwnPost({ name: 'db' }, '')).rejects.toThrow('missing-post-reference');
    expect(fs.updateDoc).not.toHaveBeenCalled();
  });
});
