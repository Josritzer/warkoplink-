import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  loaded: [],
  searched: [],
  getDocsFails: false,
  toDoc: (item) => ({ id: item.id, data: () => { const { id, ...rest } = item; return rest; } })
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn((db, ...parts) => ({ path: parts.join('/') })),
  endAt: vi.fn((value) => ({ endAt: value })),
  getDocs: vi.fn(async () => {
    if (state.getDocsFails) throw new Error('network');
    return { docs: state.searched.map(state.toDoc) };
  }),
  limit: vi.fn((count) => ({ limit: count })),
  onSnapshot: vi.fn((ref, next) => {
    next({ docs: state.loaded.map(state.toDoc) });
    return vi.fn();
  }),
  orderBy: vi.fn(() => ({})),
  query: vi.fn((...parts) => ({ parts })),
  serverTimestamp: vi.fn(() => 'server-time'),
  startAfter: vi.fn(() => ({})),
  startAt: vi.fn((value) => ({ startAt: value })),
  where: vi.fn(() => ({}))
}));

import { endAt, getDocs, startAt } from 'firebase/firestore';
import WarungDirectory from './WarungDirectory.jsx';

function makeWarung(id, name) {
  return {
    id, name, nameNormalized: name.toLowerCase(), address: 'Jl. Raya, Lamongan', facilities: [],
    priceRange: 'belum-diisi', verificationStatus: 'verified', coordinates: { lat: -7, lng: 112 }, openingHours: {}
  };
}

function renderDirectory() {
  return render(<WarungDirectory mode="directory" user={null} db={{}} onRequestAuth={vi.fn()} onNotice={vi.fn()} onOpenWarung={vi.fn()} onRegister={vi.fn()} />);
}

describe('WarungDirectory — pencarian nama', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.getDocsFails = false;
    state.loaded = Array.from({ length: 30 }, (_, index) => makeWarung(`a-${index}`, `Angkringan ${String(index).padStart(2, '0')}`));
    state.searched = [makeWarung('z-1', 'Warkop Pojok')];
  });
  afterEach(() => cleanup());

  it('menemukan warkop terverifikasi yang berada di luar 30 data pertama yang sudah dimuat', async () => {
    renderDirectory();
    expect(screen.queryByRole('button', { name: /Warkop Pojok/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Cari warkop'), { target: { value: 'Warkop Pojok' } });
    expect(await screen.findByRole('button', { name: /Warkop Pojok/ })).toBeTruthy();
    expect(startAt).toHaveBeenCalledWith('warkop pojok');
    expect(endAt).toHaveBeenCalledWith('warkop pojok');
  });

  it('tidak mengirim kueri server untuk kata kunci satu karakter', async () => {
    renderDirectory();
    fireEvent.change(screen.getByLabelText('Cari warkop'), { target: { value: 'w' } });
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('menampilkan pesan kesalahan dan tombol coba lagi saat pencarian gagal, bukan "tidak ditemukan"', async () => {
    state.getDocsFails = true;
    renderDirectory();
    fireEvent.change(screen.getByLabelText('Cari warkop'), { target: { value: 'Warkop Pojok' } });
    expect(await screen.findByText('Pencarian belum dapat dimuat')).toBeTruthy();
    expect(screen.queryByText('Warkop tidak ditemukan')).toBeNull();
    state.getDocsFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Coba cari lagi' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Warkop Pojok/ })).toBeTruthy());
  });
});
