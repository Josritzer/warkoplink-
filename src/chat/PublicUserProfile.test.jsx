import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PublicUserProfile from './PublicUserProfile.jsx';

const mocks = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ name })),
  doc: vi.fn((db, name, id) => ({ name, id })),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  limit: vi.fn(value => ({ limit: value })),
  query: vi.fn((...args) => ({ args })),
  where: vi.fn((...args) => ({ where: args }))
}));

describe('profil publik penyuka', () => {
  beforeEach(() => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ displayName: 'Dewi', photoURL: '' , email: 'private@example.test' }) });
    mocks.getDocs.mockResolvedValue({ docs: [{ id: 'post-1', data: () => ({ authorId: 'u2', body: 'Ngopi sore', topic: 'Ngopi Bareng', createdAt: new Date('2026-10-01') }) }] });
  });

  it('menampilkan identitas publik dan postingan milik pengguna', async () => {
    render(<PublicUserProfile profile={{ uid: 'u2', displayName: 'Nama lama' }} db={{}} onBack={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Dewi' })).toBeTruthy();
    expect(screen.getByText('Ngopi sore')).toBeTruthy();
    expect(screen.queryByText('private@example.test')).toBeNull();
  });

  it('menampilkan status kosong ketika belum ada postingan publik', async () => {
    mocks.getDocs.mockResolvedValueOnce({ docs: [] });
    render(<PublicUserProfile profile={{ uid: 'u2', displayName: 'Dewi' }} db={{}} onBack={() => {}} />);
    expect(await screen.findByText('Belum ada postingan publik.')).toBeTruthy();
  });
});
