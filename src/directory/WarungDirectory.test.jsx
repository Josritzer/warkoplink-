import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as firestore from 'firebase/firestore';

const fixture = vi.hoisted(() => ({ rows: [], events: [] }));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn((db, ...segments) => ({ path: segments.join('/') })),
  doc: vi.fn(),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((value) => ({ limit: value })),
  onSnapshot: vi.fn((query, onNext) => {
    if (query?.args?.[0]?.path === 'posts') {
      queueMicrotask(() => onNext({ docs: fixture.events.map(({ id, ...data }) => ({ id, data: () => data })) }));
    }
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
  fixture.events = [];
});

describe('kartu direktori warkop', () => {
  it('menyediakan empat kategori penemuan yang dapat dipilih', async () => {
    fixture.rows = [{ id: 'warung-1', name: 'Warkop Satu', address: 'Maduran, Lamongan', verificationStatus: 'verified' }];
    render(<WarungDirectory mode="directory" user={null} db={{}} {...callbacks} />);
    expect(await screen.findByRole('button', { name: /Populer/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ada Event/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Terdekat/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Warkop Terbaru/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Warkop Terbaru/ }));
    expect(screen.getByRole('button', { name: /Warkop Terbaru/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByLabelText('Filter kisaran harga')).toBeNull();
  });

  it('menampilkan acara yang masih berlangsung pada kategori event', async () => {
    fixture.rows = [{ id: 'warung-event', name: 'Warkop Acara', address: 'Lamongan', verificationStatus: 'verified' }];
    fixture.events = [{
      id: 'event-live', topic: 'Info & Acara', warungId: 'warung-event',
      body: 'Nobar final', eventKind: 'Nobar',
      eventStartAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      eventEndAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }];
    render(<WarungDirectory mode="directory" user={null} db={{}} {...callbacks} />);
    await screen.findByText('Warkop Acara');
    fireEvent.click(screen.getByRole('button', { name: /Ada Event/ }));
    expect(await screen.findByText(/Nobar · Nobar final/)).toBeTruthy();
    expect(screen.getByText('SEDANG BERLANGSUNG')).toBeTruthy();
  });

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


  it('pencarian otomatis memeriksa halaman berikutnya, bukan hanya 30 warkop pertama', async () => {
    fixture.rows = Array.from({ length: 30 }, (_, index) => ({
      id: `warung-${index}`,
      name: `Warkop ${String(index).padStart(2, '0')}`,
      address: 'Lamongan',
      verificationStatus: 'verified',
    }));
    firestore.getDocs.mockResolvedValueOnce({
      docs: [{ id: 'target-warung', data: () => ({
        name: 'Kopi Target', address: 'Maduran, Lamongan', verificationStatus: 'verified',
        photos: [], specialties: ['Kopi rempah']
      }) }]
    });

    render(<WarungDirectory mode="directory" user={null} db={{}} {...callbacks} />);
    await screen.findByText(/30 dari 30 warkop/);
    fireEvent.change(screen.getByRole('textbox', { name: 'Cari warkop' }), { target: { value: 'Kopi Target' } });

    expect(await screen.findByText('Kopi Target')).toBeTruthy();
    expect(firestore.getDocs).toHaveBeenCalledOnce();
    expect(screen.getByText(/1 dari 31 warkop/)).toBeTruthy();
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
