import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const fixture = vi.hoisted(() => ({ rows: [] }));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn((db, ...segments) => ({ path: segments.join('/') })),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((value) => ({ limit: value })),
  onSnapshot: vi.fn((query, onNext) => {
    if (query?.args?.[0]?.path === 'warungs') {
      queueMicrotask(() => onNext({
        docs: fixture.rows.map(({ id, ...data }) => ({ id, data: () => data }))
      }));
    }
    return vi.fn();
  }),
  query: vi.fn((...args) => ({ args })),
  serverTimestamp: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
}));

vi.mock('../media/uploadWarkopMedia.js', () => ({
  photoUploadErrorMessage: vi.fn(),
  uploadWarkopMedia: vi.fn(),
}));
vi.mock('../media/imagePolicy.js', () => ({
  MAX_WARUNG_PHOTOS: 5,
  validateImageFiles: vi.fn(() => ''),
}));
vi.mock('./LeafletLocationPicker.jsx', () => ({ default: () => null }));

import WarungDirectory from './WarungDirectory.jsx';

const callbacks = { onOpenWarung: vi.fn(), onRegister: vi.fn(), onNotice: vi.fn(), onRequestAuth: vi.fn() };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  fixture.rows = [];
});

describe('kartu direktori warkop', () => {
  it('menampilkan foto, menu spesial, status, dan membuka profil dari aksi utama', async () => {
    fixture.rows = [{
      id: 'warung-senja',
      name: 'Kopi Senja',
      address: 'Jl. Merdeka, Lamongan',
      photos: ['https://images.example.test/kopi-senja.webp'],
      specialties: ['Kopi susu gula aren'],
      facilities: ['Wi-Fi'],
      openingHours: { is24Hours: true },
      verificationStatus: 'verified',
    }];

    render(<WarungDirectory mode="directory" user={null} db={{}} {...callbacks} />);

    expect(await screen.findByRole('img', { name: 'Foto utama Kopi Senja' })).toBeTruthy();
    expect(screen.getByText('Kopi susu gula aren')).toBeTruthy();
    expect(within(screen.getByRole('article')).getByText('Buka 24 jam')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lihat detail Kopi Senja' }));
    expect(callbacks.onOpenWarung).toHaveBeenCalledWith('warung-senja');
  });

  it('menampilkan placeholder elegan ketika warkop belum memiliki foto', async () => {
    fixture.rows = [{
      id: 'warung-baru',
      name: 'Warkop Baru',
      address: 'Maduran, Lamongan',
      photos: [],
      verificationStatus: 'verified',
    }];

    render(<WarungDirectory mode="directory" user={null} db={{}} {...callbacks} />);

    expect(await screen.findByLabelText('Foto warkop belum tersedia untuk Warkop Baru')).toBeTruthy();
  });
});
