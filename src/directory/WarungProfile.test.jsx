import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({ warungNext: null, following: false, count: 0 }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, ...parts) => ({ path: parts.join('/') })),
  deleteDoc: vi.fn(async () => { state.following = false; }),
  doc: vi.fn((db, ...parts) => ({ path: parts.join('/') })),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: state.count }) })),
  getDoc: vi.fn(async () => ({ exists: () => state.following })),
  onSnapshot: vi.fn((ref, next) => {
    state.warungNext = next;
    next({ id: 'warung-1', exists: () => true, data: () => ({
      name: 'Warkop Pojok', verificationStatus: 'verified', address: 'Jl. Merdeka, Lamongan',
      coordinates: { lat: -7, lng: 112 }, facilities: ['Wi-Fi'], priceRange: 'hemat',
      openingHours: { keterangan: '08.00–23.00' }
    }) });
    return vi.fn();
  }),
  serverTimestamp: vi.fn(() => 'server-time'),
  setDoc: vi.fn(async () => { state.following = true; state.count += 1; }),
}));

import WarungProfile from './WarungProfile.jsx';

describe('WarungProfile', () => {
  afterEach(() => cleanup());

  it('menampilkan informasi warkop terverifikasi', async () => {
    state.following = false;
    state.count = 3;
    render(<WarungProfile warungId="warung-1" db={{}} user={null} onBack={vi.fn()} onRequestAuth={vi.fn()} onNotice={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Warkop Pojok' })).toBeTruthy();
    expect(screen.getByText('Jl. Merdeka, Lamongan')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('meminta pengguna masuk sebelum mengikuti', async () => {
    const onRequestAuth = vi.fn();
    const onNotice = vi.fn();
    render(<WarungProfile warungId="warung-1" db={{}} user={null} onBack={vi.fn()} onRequestAuth={onRequestAuth} onNotice={onNotice} />);
    fireEvent.click(await screen.findByRole('button', { name: /Ikuti/ }));
    expect(onRequestAuth).toHaveBeenCalledOnce();
    expect(onNotice).toHaveBeenCalledWith('Masuk atau buat akun untuk mengikuti warkop.');
  });

  it('menyediakan aksi mengikuti untuk pengguna yang masuk', async () => {
    state.following = false;
    state.count = 3;
    render(<WarungProfile warungId="warung-1" db={{}} user={{ uid: 'user-1' }} onBack={vi.fn()} onRequestAuth={vi.fn()} onNotice={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Ikuti/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Mengikuti/ })).toBeTruthy());
  });
});
