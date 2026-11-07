import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    render(<WarungDiscoveryPage {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    expect(screen.getByRole('dialog', { name: 'Filter warkop' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan filter' }));
    expect(screen.queryByRole('dialog', { name: 'Filter warkop' })).toBeNull();
  });

  it('shows a truthful loaded-result count and keeps load-more explicit', () => {
    render(<WarungDiscoveryPage {...baseProps} visibleWarungs={[]} locationScopedWarungs={[{ id: 'a' }, { id: 'b' }]} hasMore />);
    expect(screen.getByText(/0 dari 2 tempat yang sudah dimuat/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Muat 30 tempat lagi' })).toBeTruthy();
  });
});
