import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LikeSummary from './LikeSummary.jsx';

const mocks = vi.hoisted(() => ({ getDocs: vi.fn(), onSnapshot: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args) => ({ collection: args })),
  documentId: vi.fn(() => 'documentId'),
  getDocs: mocks.getDocs,
  limit: vi.fn(value => ({ limit: value })),
  onSnapshot: mocks.onSnapshot,
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  query: vi.fn((...args) => ({ query: args })),
  startAfter: vi.fn(value => ({ startAfter: value })),
  where: vi.fn((...args) => ({ where: args }))
}));
vi.mock('../firebase.js', () => ({ db: {} }));

describe('navigasi profil publik dari daftar penyuka', () => {
  beforeEach(() => {
    mocks.onSnapshot.mockImplementation(() => () => {});
    mocks.getDocs
      .mockResolvedValueOnce({ docs: [{ id: 'user-2' }] })
      .mockResolvedValueOnce({ docs: [{ id: 'user-2', data: () => ({ displayName: 'Dewi', photoURL: '' }) }] });
  });

  it('mengirim anggota terpilih ke navigasi halaman profil penuh', async () => {
    const user = userEvent.setup();
    const onOpenProfile = vi.fn();
    render(<LikeSummary post={{ id: 'post-1' }} user={null} liked={false} count={1} onToggleLike={() => {}} onOpenProfile={onOpenProfile} />);

    await user.click(screen.getByRole('button', { name: /lihat 1 pengguna/i }));
    await user.click(await screen.findByRole('button', { name: 'Lihat profil Dewi' }));

    expect(onOpenProfile).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'user-2',
      displayName: 'Dewi'
    }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
