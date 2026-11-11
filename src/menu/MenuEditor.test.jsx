import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({ docs: [], writes: [], updates: [] }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async (_ref, data) => { state.writes.push(data); return { id: 'menu-new' }; }),
  collection: vi.fn((_db, name) => ({ path: name })),
  doc: vi.fn((_db, name, id) => ({ path: `${name}/${id}`, id })),
  onSnapshot: vi.fn((_ref, next) => { next({ docs: state.docs.map(item => ({ id: item.id, data: () => item.data })) }); return vi.fn(); }),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  serverTimestamp: vi.fn(() => 'server-time'),
  updateDoc: vi.fn(async (ref, data) => { state.updates.push({ ref, data }); }),
  where: vi.fn((field, op, value) => ({ field, op, value })),
}));
vi.mock('../media/uploadWarkopMedia.js', () => ({
  uploadWarkopMedia: vi.fn(async () => ({ uploadId: '123e4567-e89b-12d3-a456-426614174000', quarantined: true, retryWhenPublished: true })),
  publishQuarantinedMenuPhoto: vi.fn(async () => ({ url: 'https://klikvxuronunonymmiqv.supabase.co/storage/v1/object/public/warkoplink-media/menus/warung-1/menu-new/photo.webp' })),
}));
vi.mock('../media/imagePolicy.js', () => ({ validateImageFile: vi.fn(() => '') }));

import MenuEditor from './MenuEditor.jsx';
import { publishQuarantinedMenuPhoto, uploadWarkopMedia } from '../media/uploadWarkopMedia.js';

const warung = { id: 'warung-1', ownerUid: 'owner-1', verificationStatus: 'verified', provinceCode: '35', regencyCode: '35.24', districtCode: '35.24.01', villageCode: '35.24.01.2001' };
const publishedMenu = { warungId: 'warung-1', ownerUid: 'owner-1', name: 'Kopi Susu', nameNormalized: 'kopi susu', description: 'Gula aren', categoryId: 'coffee', tags: ['signature'], priceType: 'starting', priceAmount: 15000, currency: 'IDR', photoUrl: null, status: 'published', availability: 'sold_out', isPublic: true, source: 'native', sortOrder: 0, searchTokens: ['kopi', 'susu'], regionCode: '35.24.01.2001', provinceCode: '35', regencyCode: '35.24', districtCode: '35.24.01', villageCode: '35.24.01.2001', createdAt: 'created', updatedAt: 'updated' };

describe('MenuEditor', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); state.docs = []; state.writes = []; state.updates = []; });

  it('renders published catalog with flexible price and sold-out state for visitors', async () => {
    state.docs = [{ id: 'menu-1', data: publishedMenu }];
    render(<MenuEditor db={{}} warung={warung} user={null} onNotice={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Kopi Susu' })).toBeTruthy();
    expect(screen.getByText('Mulai Rp15.000')).toBeTruthy();
    expect(screen.getByText('Habis')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Tambah menu/ })).toBeNull();
  });


  it('keeps legacy menu and specialty labels visible while the native catalog is populated', async () => {
    state.docs = [{ id: 'menu-1', data: publishedMenu }];
    render(<MenuEditor db={{}} warung={{ ...warung, menuItems: ['Teh tawar'], specialties: ['Pisang goreng'] }} user={null} onNotice={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Kopi Susu' })).toBeTruthy();
    expect(screen.getByText('Teh tawar')).toBeTruthy();
    expect(screen.getByText('Pisang goreng')).toBeTruthy();
  });

  it('creates a draft menu with normalized search tokens and a region snapshot', async () => {
    render(<MenuEditor db={{}} warung={warung} user={{ uid: 'owner-1' }} onNotice={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tambah menu' }));
    fireEvent.change(screen.getByLabelText('Nama menu'), { target: { value: '  Es Kopi Aren  ' } });
    fireEvent.change(screen.getByLabelText('Harga'), { target: { value: '17000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }));
    await waitFor(() => expect(state.writes).toHaveLength(1));
    expect(state.writes[0]).toMatchObject({
      warungId: 'warung-1', ownerUid: 'owner-1', name: 'Es Kopi Aren', nameNormalized: 'es kopi aren',
      priceType: 'fixed', priceAmount: 17000, status: 'draft', isPublic: false, sortOrder: 0,
      searchTokens: ['es', 'kopi', 'aren'], regionCode: '35.24.01.2001', provinceCode: '35',
    });
  });



  it('assigns a new item after the current catalog and supports availability updates', async () => {
    state.docs = [{ id: 'menu-1', data: publishedMenu }];
    render(<MenuEditor db={{}} warung={warung} user={{ uid: 'owner-1' }} onNotice={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Kopi Susu' });
    fireEvent.change(screen.getByLabelText('Ketersediaan Kopi Susu'), { target: { value: 'limited' } });
    await waitFor(() => expect(state.updates.some(item => item.data.availability === 'limited')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Tambah menu' }));
    fireEvent.change(screen.getByLabelText('Nama menu'), { target: { value: 'Teh Tarik' } });
    fireEvent.change(screen.getByLabelText('Harga'), { target: { value: '12000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }));
    await waitFor(() => expect(state.writes).toHaveLength(1));
    expect(state.writes[0].sortOrder).toBe(1);
  });

  it('keeps a draft photo quarantined, then publishes it only after the menu becomes public', async () => {
    const notices = vi.fn();
    render(<MenuEditor db={{}} warung={warung} user={{ uid: 'owner-1' }} onNotice={notices} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tambah menu' }));
    fireEvent.change(screen.getByLabelText('Nama menu'), { target: { value: 'Es Kopi Aren' } });
    fireEvent.change(screen.getByLabelText('Harga'), { target: { value: '18000' } });
    fireEvent.change(screen.getByLabelText(/Foto menu/), { target: { files: [new File(['image'], 'menu.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Terbitkan menu' }));
    await waitFor(() => expect(uploadWarkopMedia).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'menu', warungId: 'warung-1', menuItemId: 'menu-new' })));
    await waitFor(() => expect(publishQuarantinedMenuPhoto).toHaveBeenCalledWith(expect.anything(), 'warung-1', 'menu-new', '123e4567-e89b-12d3-a456-426614174000'));
    expect(state.updates.some(item => item.data.pendingPhotoUploadId === '123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(state.updates.some(item => item.data.status === 'published' && item.data.isPublic === true)).toBe(true);
    expect(state.updates.some(item => item.data.pendingPhotoUploadId === null)).toBe(true);
    expect(notices).toHaveBeenCalledWith('Menu berhasil diterbitkan.');
  });

  it('supports an unlisted price without inventing a numeric amount', async () => {
    render(<MenuEditor db={{}} warung={warung} user={{ uid: 'owner-1' }} onNotice={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tambah menu' }));
    fireEvent.change(screen.getByLabelText('Nama menu'), { target: { value: 'Teh Tawar' } });
    fireEvent.change(screen.getByLabelText('Tipe harga'), { target: { value: 'unlisted' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }));
    await waitFor(() => expect(state.writes).toHaveLength(1));
    expect(state.writes[0].priceType).toBe('unlisted');
    expect(state.writes[0].priceAmount).toBeNull();
  });

  it('preserves published state when an owner edits an existing menu and archives without deleting', async () => {
    state.docs = [{ id: 'menu-1', data: publishedMenu }];
    render(<MenuEditor db={{}} warung={warung} user={{ uid: 'owner-1' }} onNotice={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Kopi Susu' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Kopi Susu' }));
    fireEvent.change(screen.getByLabelText('Deskripsi menu'), { target: { value: 'Kopi aren creamy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }));
    await waitFor(() => expect(state.updates.some(item => item.data.description === 'Kopi aren creamy')).toBe(true));
    expect(state.updates.find(item => item.data.description === 'Kopi aren creamy').data).toMatchObject({ status: 'published', isPublic: true });
    fireEvent.click(screen.getByRole('button', { name: 'Arsipkan Kopi Susu' }));
    await waitFor(() => expect(state.updates.some(item => item.data.status === 'archived')).toBe(true));
  });
});
