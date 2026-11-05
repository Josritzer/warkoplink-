import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateDoc } from 'firebase/firestore';
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
      name: 'Warkop Pojok', verificationStatus: 'verified', ownerUid: 'owner-1', address: 'Jl. Merdeka, Lamongan', whatsapp: '6281234567890',
      coordinates: { lat: -7, lng: 112 }, facilities: ['Wi-Fi'], priceRange: 'premium',
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
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('menampilkan informasi warkop terverifikasi', async () => {
    state.following = false;
    state.count = 3;
    render(<WarungProfile warungId="warung-1" db={{}} user={null} onBack={vi.fn()} onRequestAuth={vi.fn()} onNotice={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Warkop Pojok' })).toBeTruthy();
    expect(screen.getByText('Jl. Merdeka, Lamongan')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chat WhatsApp' }).getAttribute('href')).toBe('https://wa.me/6281234567890');
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

  it('pemilik dapat memperbarui menu, menu spesial, fasilitas, suasana, jam dan aktivitas', async () => {
    const onNotice = vi.fn();
    render(<WarungProfile warungId="warung-1" db={{}} user={{ uid: 'owner-1' }} onBack={vi.fn()} onRequestAuth={vi.fn()} onNotice={onNotice} />);
    fireEvent.change(await screen.findByLabelText('Menu utama warkop'), { target: { value: 'Kopi susu, Teh tarik' } });
    fireEvent.change(screen.getByLabelText('Menu spesial warkop'), { target: { value: 'Kopi gula aren' } });
    fireEvent.change(screen.getByLabelText('Fasilitas warkop'), { target: { value: 'Wi-Fi, Parkir luas' } });
    fireEvent.change(screen.getByLabelText('Suasana warkop'), { target: { value: 'Nyaman untuk ngobrol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan profil' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    const payload = updateDoc.mock.calls[0][1];
    expect(payload.menuItems).toEqual(['Kopi susu', 'Teh tarik']);
    expect(payload.specialties).toEqual(['Kopi gula aren']);
    expect(payload.facilities).toEqual(['Wi-Fi', 'Parkir luas']);
    expect(payload.ambience).toBe('Nyaman untuk ngobrol');
    expect(onNotice).toHaveBeenCalledWith('Profil warkop berhasil diperbarui.');
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
