import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({ warungNext: null, following: false, count: 0, events: [], warung: null }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, ...parts) => ({ path: parts.join('/') })),
  deleteDoc: vi.fn(async () => { state.following = false; }),
  doc: vi.fn((db, ...parts) => ({ path: parts.join('/') })),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: state.count }) })),
  getDoc: vi.fn(async () => ({ exists: () => state.following })),
  limit: vi.fn((value) => ({ limit: value })),
  query: vi.fn((...args) => ({ args, path: args[0]?.path })),
  where: vi.fn((...args) => ({ where: args })),
  onSnapshot: vi.fn((ref, next) => {
    if (ref.path === 'posts') {
      next({ docs: state.events.map(item => ({ id: item.id, data: () => item })) });
      return vi.fn();
    }
    state.warungNext = next;
    next({ id: 'warung-1', exists: () => true, data: () => state.warung || ({
      name: 'Warkop Pojok', verificationStatus: 'verified', address: 'Jl. Merdeka, Lamongan',
      coordinates: { lat: -7, lng: 112 }, facilities: ['Wi-Fi'], priceRange: 'belum-diisi',
      menuItems: ['Kopi', 'Teh'], specialties: ['Kopi racikan'], ambience: 'Santai untuk ngobrol',
      openingHours: { keterangan: '08.00–23.00' }
    }) });
    return vi.fn();
  }),
  serverTimestamp: vi.fn(() => 'server-time'),
  setDoc: vi.fn(async () => { state.following = true; state.count += 1; }),
  updateDoc: vi.fn(async () => undefined),
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
    expect(screen.getByText('Menu utama')).toBeTruthy();
    expect(screen.getByText('Kopi racikan')).toBeTruthy();
    expect(screen.getByText('Santai untuk ngobrol')).toBeTruthy();
    expect(screen.queryByText(/Kisaran harga:/)).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
  });


  it('menampilkan acara yang terhubung ke profil warkop untuk pengunjung publik', async () => {
    state.events = [{
      id: 'event-1', topic: 'Info & Acara', warungId: 'warung-1',
      body: 'Nobar final\n\nMulai pukul 19.00', eventKind: 'Nobar',
      eventStartAt: '2099-06-20T12:00:00.000Z', eventStatus: 'scheduled'
    }];
    render(<WarungProfile warungId="warung-1" db={{}} user={null} onBack={vi.fn()} onRequestAuth={vi.fn()} onNotice={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Acara dari warkop ini' })).toBeTruthy();
    expect(screen.getByText('Nobar final')).toBeTruthy();
    state.events = [];
  });


  it('menampilkan jadwal mingguan sebenarnya dan petunjuk untuk bagian profil yang kosong', async () => {
    state.warung = {
      name: 'Warkop Senja', verificationStatus: 'verified', address: 'Maduran, Lamongan',
      openingHours: {
        is24Hours: false,
        keterangan: 'Jadwal mingguan tersedia di profil',
        schedule: {
          mon: { open: '08:00', close: '22:00' }, tue: { closed: true },
          wed: { open: '09:00', close: '23:00' }, thu: { open: '09:00', close: '23:00' },
          fri: { open: '09:00', close: '23:00' }, sat: { open: '09:00', close: '23:00' },
          sun: { open: '09:00', close: '23:00' }
        }
      },
      menuItems: [], specialties: [], facilities: [], activities: [], photos: [], ambience: ''
    };
    render(<WarungProfile warungId="warung-1" db={{}} user={null} onBack={vi.fn()} onRequestAuth={vi.fn()} onNotice={vi.fn()} />);
    expect(await screen.findByText('Senin')).toBeTruthy();
    expect(screen.getByText('08.00–22.00')).toBeTruthy();
    expect(screen.getByText('Tutup')).toBeTruthy();
    expect(screen.getByText(/Menu belum dicantumkan/)).toBeTruthy();
    expect(screen.getByText(/Fasilitas belum dicantumkan/)).toBeTruthy();
    expect(screen.getByText(/Suasana belum dideskripsikan/)).toBeTruthy();
    state.warung = null;
  });


  it('pemilik dapat mengedit identitas, menu, fasilitas, dan suasana warkop', async () => {
    const { updateDoc } = await import('firebase/firestore');
    state.warung = {
      name: 'Warkop Pojok', ownerUid: 'owner-1', verificationStatus: 'verified',
      address: 'Jl. Merdeka, Lamongan', coordinates: { lat: -7, lng: 112 },
      facilities: ['Wi-Fi'], menuItems: ['Kopi', 'Teh'], specialties: ['Kopi racikan'],
      ambience: 'Santai untuk ngobrol', priceRange: 'belum-diisi',
      openingHours: { keterangan: '08.00–23.00' }, photos: []
    };
    render(<WarungProfile warungId="warung-1" db={{}} user={{ uid: 'owner-1' }} onBack={vi.fn()} onRequestAuth={vi.fn()} onNotice={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Kelola Warkop' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nama warkop'), { target: { value: 'Warkop Senja' } });
    fireEvent.change(screen.getByLabelText('Alamat warkop'), { target: { value: 'Jl. Baru, Maduran, Lamongan' } });
    fireEvent.change(screen.getByLabelText('Menu utama (pisahkan dengan koma)'), { target: { value: 'Kopi, Teh tarik' } });
    fireEvent.change(screen.getByLabelText('Menu spesial (pisahkan dengan koma)'), { target: { value: 'Kopi gula aren' } });
    fireEvent.change(screen.getByLabelText('Fasilitas (pisahkan dengan koma)'), { target: { value: 'Wi-Fi, Parkir, Toilet' } });
    fireEvent.change(screen.getByLabelText('Suasana warkop'), { target: { value: 'Nyaman untuk kerja dan ngobrol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan warkop' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: 'Warkop Senja',
      nameNormalized: 'warkop senja',
      address: 'Jl. Baru, Maduran, Lamongan',
      menuItems: ['Kopi', 'Teh tarik'],
      specialties: ['Kopi gula aren'],
      facilities: ['Wi-Fi', 'Parkir', 'Toilet'],
      ambience: 'Nyaman untuk kerja dan ngobrol'
    })));
    state.warung = null;
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
