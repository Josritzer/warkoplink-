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
      .mockResolvedValueOnce({ docs: [{ id: 'user-2', data: () => ({ displayName: 'Dewi', photoURL: '' }) }] })
      .mockResolvedValueOnce({ docs: [{ id: 'post-1', data: () => ({ authorId: 'user-2', body: 'Ngopi sore', createdAt: new Date('2026-10-01') }) }] });
  });

  it('tombol kembali dan tombol Back perangkat menutup profil tanpa menutup daftar penyuka', async () => {
    const user = userEvent.setup();
    render(<LikeSummary post={{ id: 'post-1' }} user={null} liked={false} count={1} onToggleLike={() => {}} />);

    await user.click(screen.getByRole('button', { name: /lihat 1 pengguna/i }));
    const liker = await screen.findByRole('button', { name: 'Lihat profil Dewi' });
    await user.click(liker);
    expect(await screen.findByRole('heading', { name: 'Profil pengguna' })).toBeTruthy();

    const backButton = screen.getByRole('button', { name: 'Kembali ke daftar penyuka' });
    await user.click(backButton);
    fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Profil pengguna' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Lihat profil Dewi' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Lihat profil Dewi' }));
    await screen.findByRole('heading', { name: 'Profil pengguna' });
    fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Profil pengguna' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Lihat profil Dewi' })).toBeTruthy();
  });
});
