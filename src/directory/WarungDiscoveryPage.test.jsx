import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WarungDiscoveryPage from './WarungDiscoveryPage.jsx';

afterEach(cleanup);

const baseProps = {
  location: { mode: 'all', label: 'Semua Lokasi' },
  category: 'all',
  onCategoryChange: vi.fn(),
  searchTerm: '',
  onSearchChange: vi.fn(),
  facilityOptions: [],
  activityOptions: [],
  facilityFilter: [],
  activityFilter: [],
  onToggleFacility: vi.fn(),
  onToggleActivity: vi.fn(),
  operationalFilter: 'semua',
  onOperationalChange: vi.fn(),
  sort: 'relevance',
  onSortChange: vi.fn(),
  hasLocation: false,
  hasActiveFilter: false,
  onResetFilters: vi.fn(),
  status: 'ready',
  visibleWarungs: [],
  locationScopedWarungs: [],
  locationStatus: 'idle',
  effectiveVisitorLocation: null,
  eventsStatus: 'idle',
  discoveryEvents: [],
  distances: {},
  eventByWarung: new Map(),
  now: new Date('2026-11-07T00:00:00.000Z'),
  mapViewOpen: false,
  onToggleMap: vi.fn(),
  onOpenWarung: vi.fn(),
  hasMore: false,
  loadingMore: false,
  onLoadMore: vi.fn(),
  moreError: '',
  onRegister: vi.fn(),
  onRetry: vi.fn(),
};

describe('WarungDiscoveryPage', () => {
  it('offers a Popular category and selects it as a real discovery category', () => {
    const onCategoryChange = vi.fn();
    render(<WarungDiscoveryPage {...baseProps} onCategoryChange={onCategoryChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Populer' }));
    expect(onCategoryChange).toHaveBeenCalledWith('popular');
  });

  it('renders the premium discovery hero and nationwide scope', () => {
    render(<WarungDiscoveryPage {...baseProps} />);
    expect(screen.getByRole('heading', { name: /Temukan tempat singgah/ })).toBeTruthy();
    expect(screen.getByLabelText('Cari warkop')).toBeTruthy();
    expect(screen.getByText(/Seluruh Indonesia/)).toBeTruthy();
  });

  it('keeps mood categories in a labelled horizontal navigation rail', () => {
    render(<WarungDiscoveryPage {...baseProps} />);
    expect(screen.getByRole('group', { name: 'Jelajahi berdasarkan suasana' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kerja & Laptop/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Menu Spesial/ })).toBeTruthy();
  });

  it('places filter and map controls immediately after search and before discovery sections', () => {
    render(<WarungDiscoveryPage {...baseProps} />);
    const search = screen.getByRole('textbox', { name: 'Cari warkop' });
    const controls = screen.getByRole('group', { name: 'Kontrol pencarian' });
    const moods = screen.getByRole('group', { name: 'Jelajahi berdasarkan suasana' });
    expect(search.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(controls.compareDocumentPosition(moods) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(controls).getByRole('button', { name: /Filter/ })).toBeTruthy();
    expect(within(controls).getByRole('button', { name: /Peta/ })).toBeTruthy();
  });

  it('renders real verified warung cards with their available photo and details', () => {
    render(<WarungDiscoveryPage {...baseProps} visibleWarungs={[{
      id: 'warung-1', name: 'Kopi Senja', address: 'Jl. Merdeka',
      photos: ['https://images.example.test/kopi.webp'],
      specialties: ['Kopi rempah'], provinceName: 'Jawa Timur',
    }]} locationScopedWarungs={[{ id: 'warung-1' }]} />);
    expect(screen.getAllByText('Kopi Senja').length).toBeGreaterThan(0);
    expect(screen.getAllByAltText('Foto utama Kopi Senja').length).toBeGreaterThan(0);
    expect(screen.getByText('Kopi rempah')).toBeTruthy();
  });

  it('opens advanced filters in an accessible sheet and closes after applying', () => {
    render(<WarungDiscoveryPage {...baseProps}
      activityOptions={[{ key: 'nobar', label: 'Nobar' }]}
      facilityOptions={[{ key: 'wifi', label: 'Wi-Fi', count: 2 }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    const dialog = screen.getByRole('dialog', { name: 'Filter warkop' });
    expect(dialog).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Jelajahi berdasarkan kebutuhan' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Aktivitas & suasana' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Fasilitas yang tersedia' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Waktu operasional' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Urutan hasil' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Populer/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Menu Spesial/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan hasil pencarian' }));
    expect(screen.queryByRole('dialog', { name: 'Filter warkop' })).toBeNull();
  });

  it('lets users select a discovery category directly from the filter sheet', () => {
    const onCategoryChange = vi.fn();
    render(<WarungDiscoveryPage {...baseProps} onCategoryChange={onCategoryChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    const dialog = screen.getByRole('dialog', { name: 'Filter warkop' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Populer/ }));
    expect(onCategoryChange).toHaveBeenCalledWith('popular');
  });

  it('always shows the complete activity classification and facility section when the loaded directory has no metadata', () => {
    render(<WarungDiscoveryPage {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    const dialog = screen.getByRole('dialog', { name: 'Filter warkop' });
    expect(within(dialog).getByRole('heading', { name: 'Aktivitas & suasana' })).toBeTruthy();
    expect(within(dialog).getByText('Kerja & produktivitas')).toBeTruthy();
    expect(within(dialog).getByText('Ngopi & komunitas')).toBeTruthy();
    expect(within(dialog).getByText('Hiburan & kegiatan')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Nobar' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Bekerja dengan laptop' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Fasilitas yang tersedia' })).toBeTruthy();
    expect(within(dialog).getByText(/Belum ada fasilitas yang dicantumkan oleh warkop di wilayah ini/)).toBeTruthy();
  });

  it('shows a truthful loaded-result count and keeps load-more explicit', () => {
    render(<WarungDiscoveryPage {...baseProps} visibleWarungs={[]} locationScopedWarungs={[{ id: 'a' }, { id: 'b' }]} hasMore />);
    expect(screen.getByText(/0 dari 2 tempat yang sudah dimuat/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Muat 30 tempat lagi' })).toBeTruthy();
  });

  it('Terdekat tanpa lokasi menjelaskan izin ditolak, menyembunyikan jumlah dan muat-lebih-banyak, lalu coba lagi memanggil ulang Terdekat', () => {
    const onCategoryChange = vi.fn();
    render(<WarungDiscoveryPage {...baseProps} category="nearby" locationStatus="denied" onCategoryChange={onCategoryChange}
      locationScopedWarungs={[{ id: 'a' }]} hasMore />);
    expect(screen.getByText('Aktifkan lokasi untuk menemukan warkop terdekat.')).toBeTruthy();
    expect(screen.getByText(/Izin lokasi ditolak/)).toBeTruthy();
    expect(screen.queryByText(/tempat yang sudah dimuat/)).toBeNull();
    expect(screen.queryByText('Belum ada tempat yang cocok.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Muat 30 tempat lagi' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(onCategoryChange).toHaveBeenCalledWith('nearby');
  });

  it('Terdekat dengan GPS gagal selain izin menawarkan coba lagi dengan penjelasan yang tepat', () => {
    render(<WarungDiscoveryPage {...baseProps} category="nearby" locationStatus="error" />);
    expect(screen.getByText(/Lokasi perangkat belum tersedia/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeTruthy();
  });

  it('Terdekat di browser tanpa geolocation tidak menawarkan tombol yang tidak berfungsi', () => {
    render(<WarungDiscoveryPage {...baseProps} category="nearby" locationStatus="unsupported" />);
    expect(screen.getByText('Lokasi tidak tersedia di browser ini.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Coba lagi' })).toBeNull();
  });

  it('Terdekat saat posisi dicari hanya menampilkan status memuat', () => {
    render(<WarungDiscoveryPage {...baseProps} category="nearby" locationStatus="loading" />);
    expect(screen.getByText('Mencari tempat di sekitar lokasi perangkat…')).toBeTruthy();
    expect(screen.queryByText('Aktifkan lokasi untuk menemukan warkop terdekat.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Coba lagi' })).toBeNull();
  });

  it('Terdekat dengan lokasi valid menampilkan jarak, jumlah, dan tanpa pesan lokasi', () => {
    render(<WarungDiscoveryPage {...baseProps} category="nearby" locationStatus="ready"
      effectiveVisitorLocation={{ lat: -7.05, lng: 112.3 }} distances={{ near: 1.2 }}
      visibleWarungs={[{ id: 'near', name: 'Warkop Dekat', address: 'Lamongan' }]} locationScopedWarungs={[{ id: 'near' }, { id: 'far' }]} />);
    expect(screen.getByText(/±1\.2 km · garis lurus/)).toBeTruthy();
    expect(screen.getByText(/1 dari 2 tempat yang sudah dimuat/)).toBeTruthy();
    expect(screen.queryByText('Aktifkan lokasi untuk menemukan warkop terdekat.')).toBeNull();
  });
});
