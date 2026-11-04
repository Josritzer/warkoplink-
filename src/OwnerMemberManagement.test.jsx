import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ name })),
  getDocs: vi.fn(async () => ({
    docs: [
      { id: 'member-1', data: () => ({ displayName: 'Budi Lamongan', username: 'budi', location: 'Maduran', bio: 'Suka ngopi', updatedAt: null }) },
      { id: 'member-2', data: () => ({ displayName: 'Sari', username: 'sari', location: 'Paciran', updatedAt: null }) },
    ],
  })),
  limit: vi.fn((value) => ({ limit: value })),
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  query: vi.fn((...args) => ({ args })),
  startAfter: vi.fn((value) => ({ startAfter: value })),
}));

import OwnerMemberManagement from './OwnerMemberManagement.jsx';

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('OwnerMemberManagement', () => {
  it('memuat data profil publik tanpa menampilkan email', async () => {
    render(<OwnerMemberManagement db={{}}/>);
    expect(await screen.findByText('Budi Lamongan')).toBeTruthy();
    expect(screen.getByText('@budi')).toBeTruthy();
    expect(screen.queryByText(/@.*gmail\.com/)).toBeNull();
  });

  it('memfilter anggota yang sudah dimuat berdasarkan nama dan lokasi', async () => {
    render(<OwnerMemberManagement db={{}}/>);
    await screen.findByText('Budi Lamongan');
    fireEvent.change(screen.getByRole('textbox', { name: 'Cari anggota' }), { target: { value: 'Paciran' } });
    expect(screen.getByText('Sari')).toBeTruthy();
    expect(screen.queryByText('Budi Lamongan')).toBeNull();
  });
});
