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
  onSearchSubmit: vi.fn(),
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
    expect(screen.getByRole('searchbox', { name: 'Cari warkop' })).toBeTruthy();
    expect(screen.getByText(/Seluruh Indonesia/)).toBeTruthy();
  });

  it('separates one-choice directory categories from multi-choice activity filters', () => {
    render(<WarungDiscoveryPage {...baseProps} />);
    expect(screen.getByRole('group', { name: 'Kategori penjelajahan, pilih satu' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Filter aktivitas dan suasana, pilih satu atau beberapa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kerja & Laptop/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Menu Spesial/ })).toBeTruthy();
  });

  it('runs a submitted search immediately and exposes a clear action', () => {
    const onSearchChange = vi.fn();
    const onSearchSubmit = vi.fn();
    render(<WarungDiscoveryPage {...baseProps} onSearchChange={onSearchChange} onSearchSubmit={onSearchSubmit} searchTerm="Kopi Senja" />);
    expect(screen.getByRole('searchbox', { name: 'Cari warkop' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cari' }));
    expect(onSearchSubmit).toHaveBeenCalledWith('Kopi Senja');
    fireEvent.click(screen.getByRole('button', { name: 'Hapus kata pencarian' }));
    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(onSearchSubmit).toHaveBeenCalledWith('');
  });

  it('treats quick activity chips as additive filters rather than directory categories', () => {
    const onCategoryChange = vi.fn();
    const onToggleActivity = vi.fn();
    render(<WarungDiscoveryPage {...baseProps} onCategoryChange={onCategoryChange} onToggleActivity={onToggleActivity} />);
    const activities = screen.getByRole('group', { name: 'Filter aktivitas dan suasana, pilih satu atau beberapa' });
    fireEvent.click(within(activities).getByRole('button', { name: /Kerja & Laptop/ }));
    expect(onCategoryChange).toHaveBeenCalledWith('all');
    expect(onToggleActivity).toHaveBeenCalledTimes(1);
  });

  it('places filter and map controls immediately after search and before discovery sections', () => {
    render(<WarungDiscoveryPage {...baseProps} />);
    const search = screen.getByRole('searchbox', { name: 'Cari warkop' });
    const controls = screen.getByRole('group', { name: 'Kontrol pencarian' });
    const moods = screen.getByRole('group', { name: 'Kategori penjelajahan, pilih satu' });
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
    const toggle = screen.getByRole('button', { name: /Filter/ });
    fireEvent.click(toggle);
    const dialog = screen.getByRole('dialog', { name: 'Atur preferensi Anda' });
    expect(dialog).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Jelajahi berdasarkan kebutuhan' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Aktivitas & suasana' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Fasilitas yang tersedia' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Waktu operasional' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Urutan hasil' })).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBeNull();
    expect(screen.getAllByRole('button', { name: /Populer/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Menu Spesial/ }).length).toBeGreaterThan(0);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Atur preferensi Anda' })).toBeNull();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan hasil pencarian' }));
    expect(screen.queryByRole('dialog', { name: 'Atur preferensi Anda' })).toBeNull();
  });

  it('treats the mobile filter sheet as modal, traps focus, and closes on Escape', () => {
    const previousMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    try {
      render(<WarungDiscoveryPage {...baseProps} />);
      const toggle = screen.getByRole('button', { name: /Filter/ });
      fireEvent.click(toggle);
      const dialog = screen.getByRole('dialog', { name: 'Atur preferensi Anda' });
      const close = within(dialog).getByRole('button', { name: 'Tutup filter' });
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(toggle.getAttribute('aria-controls')).toBe(dialog.id);
      expect(document.activeElement).toBe(close);
      const done = within(dialog).getByRole('button', { name: 'Tampilkan hasil pencarian' });
      done.focus();
      fireEvent.keyDown(done, { key: 'Tab' });
      expect(document.activeElement).toBe(close);
      fireEvent.keyDown(close, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: 'Atur preferensi Anda' })).toBeNull();
      expect(document.activeElement).toBe(toggle);
    } finally {
      cleanup();
      if (previousMatchMedia) Object.defineProperty(window, 'matchMedia', previousMatchMedia);
      else delete window.matchMedia;
    }
  });

  it('lets users select a discovery category directly from the filter sheet', () => {
    const onCategoryChange = vi.fn();
    render(<WarungDiscoveryPage {...baseProps} onCategoryChange={onCategoryChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    const dialog = screen.getByRole('dialog', { name: 'Atur preferensi Anda' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Populer/ }));
    expect(onCategoryChange).toHaveBeenCalledWith('popular');
  });

  it('always shows the complete activity classification and facility section when the loaded directory has no metadata', () => {
    render(<WarungDiscoveryPage {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    const dialog = screen.getByRole('dialog', { name: 'Atur preferensi Anda' });
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

  it('explains that an empty search only covers loaded places when another page remains', () => {
    render(<WarungDiscoveryPage {...baseProps} searchTerm="Kopi Senja" visibleWarungs={[]} locationScopedWarungs={[{ id: 'a' }, { id: 'b' }]} hasMore />);
    expect(screen.getByText(/Belum cocok di 2 tempat yang sudah dimuat/)).toBeTruthy();
    expect(screen.getByText(/Muat 30 tempat lagi untuk memperluas pencarian/)).toBeTruthy();
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
    expect(screen.queryByRole('heading', { name: 'Belum ada tempat yang cocok.' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Coba lagi' })).toBeNull();
  });

  it('does not show an empty event result while event data is loading', () => {
    render(<WarungDiscoveryPage {...baseProps} category="events" eventsStatus="loading" />);
    expect(screen.getByText('Memuat acara warkop…')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Belum ada acara warkop.' })).toBeNull();
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
