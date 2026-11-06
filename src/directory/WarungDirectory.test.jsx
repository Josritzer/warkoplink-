import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import * as media from '../media/uploadWarkopMedia.js';

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
vi.mock('./LeafletLocationPicker.jsx', () => ({ default: ({ onChange }) => <button type="button" onClick={() => onChange('-7.05', '112.30')}>Pilih titik lokasi (uji)</button> }));
vi.mock('./OfficialRegionPicker.jsx', () => ({ default: ({ onChange }) => <button type="button" onClick={() => onChange({ provinceCode: '35', provinceName: 'Jawa Timur', regencyCode: '35.24', regencyName: 'Kabupaten Lamongan', districtCode: '35.24.10', districtName: 'Maduran', villageCode: '35.24.10.2007', villageName: 'Maduran' })}>Pilih wilayah resmi (uji)</button> }));

import WarungDirectory from './WarungDirectory.jsx';

const callbacks = { onOpenWarung: vi.fn(), onRegister: vi.fn(), onNotice: vi.fn(), onRequestAuth: vi.fn() };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  fixture.rows = [];
  fixture.events = [];
});

describe('kartu direktori warkop', () => {


  it('memilih lokasi lewat peta atau GPS tanpa meminta koordinat manual', () => {
    render(<WarungDirectory mode="register" user={{ uid: 'owner-location' }} db={{}} {...callbacks} />);
    expect(screen.queryByLabelText('Lintang (latitude)')).toBeNull();
    expect(screen.queryByLabelText('Bujur (longitude)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pilih titik lokasi (uji)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gunakan Lokasi Saya' })).toBeTruthy();
  });

  it('mengutamakan menu spesial dan tidak meminta kisaran harga saat pendaftaran', async () => {
    render(<WarungDirectory mode="register" user={{ uid: 'owner-1' }} db={{}} {...callbacks} />);
    fireEvent.change(screen.getByLabelText('Nama warkop'), { target: { value: 'Warkop Maduran' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pilih wilayah resmi (uji)' }));
    fireEvent.change(screen.getByLabelText('Alamat lengkap'), { target: { value: 'Desa Maduran, Kecamatan Maduran, Lamongan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pilih titik lokasi (uji)' }));
    fireEvent.change(screen.getByLabelText('Nomor WhatsApp aktif'), { target: { value: '081234567890' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(await screen.findByLabelText('Menu spesial, pisahkan dengan koma')).toBeTruthy();
    expect(screen.queryByText(/Kisaran harga/)).toBeNull();
  });

  it('menyimpan kode wilayah resmi sampai tingkat desa/kelurahan', async () => {
    render(<WarungDirectory mode="register" user={{ uid: 'owner-2' }} db={{}} {...callbacks} />);
    fireEvent.change(screen.getByLabelText('Nama warkop'), { target: { value: 'Kopi Surabaya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pilih wilayah resmi (uji)' }));
    fireEvent.change(screen.getByLabelText('Alamat lengkap'), { target: { value: 'Jl. Tunjungan, Surabaya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pilih titik lokasi (uji)' }));
    fireEvent.change(screen.getByLabelText('Nomor WhatsApp aktif'), { target: { value: '081234567890' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(await screen.findByLabelText('Menu spesial, pisahkan dengan koma')).toBeTruthy();
    firestore.addDoc.mockResolvedValueOnce({ id: 'new-warkop-surabaya' });
    media.uploadWarkopMedia.mockResolvedValueOnce({ url: 'https://example.test/main.webp' });
    fireEvent.change(screen.getByLabelText('Menu spesial, pisahkan dengan koma'), { target: { value: 'Kopi racikan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    const mainPhoto = new File(['image'], 'warkop.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Foto utama warkop dan foto tambahan'), { target: { files: [mainPhoto] } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim pendaftaran' }));
    await waitFor(() => expect(firestore.addDoc).toHaveBeenCalledOnce());
    expect(firestore.addDoc.mock.calls[0][1]).toMatchObject({
      regionCode: '35.24.10.2007',
      provinceCode: '35', provinceName: 'Jawa Timur',
      regencyCode: '35.24', regencyName: 'Kabupaten Lamongan',
      districtCode: '35.24.10', districtName: 'Maduran',
      villageCode: '35.24.10.2007', villageName: 'Maduran',
      verificationStatus: 'pending',
      whatsapp: '6281234567890',
      specialties: ['Kopi racikan'],
      registrationPolicyVersion: 2,
    });
  });

  it('mewajibkan WhatsApp, menu spesial, dan foto utama sebelum membuat pendaftaran', async () => {
    render(<WarungDirectory mode="register" user={{ uid: 'owner-required' }} db={{}} {...callbacks} />);
    fireEvent.change(screen.getByLabelText('Nama warkop'), { target: { value: 'Warkop Wajib' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pilih wilayah resmi (uji)' }));
    fireEvent.change(screen.getByLabelText('Alamat lengkap'), { target: { value: 'Desa Maduran, Lamongan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pilih titik lokasi (uji)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(await screen.findByText(/Nomor WhatsApp wajib diisi/)).toBeTruthy();
    expect(firestore.addDoc).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nomor WhatsApp aktif'), { target: { value: '081234567890' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(await screen.findByLabelText('Menu spesial, pisahkan dengan koma')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(await screen.findByText(/Tambahkan minimal satu menu spesial/)).toBeTruthy();
    expect(firestore.addDoc).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Menu spesial, pisahkan dengan koma'), { target: { value: 'Kopi racikan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(await screen.findByLabelText('Foto utama warkop dan foto tambahan')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kirim pendaftaran' }));
    expect(await screen.findByText(/Pilih minimal satu foto utama/)).toBeTruthy();
    expect(firestore.addDoc).not.toHaveBeenCalled();
  });

  it('menerapkan cakupan wilayah global pada seluruh hasil direktori', async () => {
    fixture.rows = [
      { id: 'lamongan', name: 'Kopi Maduran', address: 'Maduran', regencyName: 'Kabupaten Lamongan', verificationStatus: 'verified' },
      { id: 'surabaya', name: 'Kedai Tunjungan', address: 'Surabaya', regencyName: 'Kota Surabaya', verificationStatus: 'verified' }
    ];
    render(<WarungDirectory mode="directory" location={{ mode: 'region', label: 'Kota Surabaya', query: 'surabaya' }} user={null} db={{}} {...callbacks} />);
    expect(await screen.findByText('Kedai Tunjungan')).toBeTruthy();
    expect(screen.queryByText('Kopi Maduran')).toBeNull();
    expect(screen.getByText(/1 dari 1 warkop pada cakupan lokasi yang dipilih/)).toBeTruthy();
  });

  it('menyediakan empat kategori penemuan yang dapat dipilih', async () => {
    fixture.rows = [{ id: 'warung-1', name: 'Warkop Satu', address: 'Maduran, Lamongan', specialties: ['Kopi rempah'], verificationStatus: 'verified' }];
    render(<WarungDirectory mode="directory" user={null} db={{}} {...callbacks} />);
    expect(await screen.findByRole('button', { name: /Populer/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ada Event/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Terdekat/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Menu Spesial/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Warkop Terbaru/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Menu Spesial/ }));
    expect(screen.getByRole('button', { name: /Menu Spesial/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Hapus filter' })).toBeNull();
    expect(screen.queryByLabelText('Filter kisaran harga')).toBeNull();
    expect(screen.getByPlaceholderText('Cari nama, alamat, menu, menu spesial, fasilitas…')).toBeTruthy();
    expect(screen.getByText('Kopi rempah')).toBeTruthy();
  });

  it('langsung membuka tampilan peta saat diminta dari menu lokasi global', async () => {
    fixture.rows = [{ id: 'map-request', name: 'Warkop Peta', address: 'Lamongan', verificationStatus: 'verified' }];
    render(<WarungDirectory mode="directory" mapViewRequested user={null} db={{}} {...callbacks} />);
    expect(await screen.findByRole('application', { name: 'Peta interaktif WARKOPLINK' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lihat daftar' })).toBeTruthy();
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

  it('membuka peta interaktif dari hasil direktori yang sedang difilter', async () => {
    fixture.rows = [{
      id: 'warung-map', name: 'Kopi Peta', address: 'Maduran',
      coordinates: { lat: -7.05, lng: 112.3 }, verificationStatus: 'verified'
    }];
    render(<WarungDirectory mode="directory" user={null} db={{}} {...callbacks} />);
    expect(await screen.findByText('Kopi Peta')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Jelajahi Peta' }));
    expect(screen.getByRole('application', { name: 'Peta interaktif WARKOPLINK' })).toBeTruthy();
    expect(screen.queryByText('Kopi Peta')).toBeNull();
    expect(screen.getByText('1 titik warkop')).toBeTruthy();
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
