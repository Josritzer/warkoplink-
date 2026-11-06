import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GlobalLocationSelector from './GlobalLocationSelector.jsx';

const results = [
  { code: '35', name: 'Jawa Timur', level: 'province' },
  { code: '35.24', name: 'Kabupaten Lamongan', level: 'regency', nama_provinsi: 'Jawa Timur' },
  { code: '35.24.10', name: 'Maduran', level: 'district', nama_kabupaten: 'Kabupaten Lamongan', nama_provinsi: 'Jawa Timur' },
  { code: '35.24.10.2007', name: 'Maduran', level: 'village', nama_kecamatan: 'Maduran', nama_kabupaten: 'Kabupaten Lamongan', nama_provinsi: 'Jawa Timur' },
  { code: '35.24.11', name: 'Deket', level: 'district', nama_kabupaten: 'Kabupaten Lamongan', nama_provinsi: 'Jawa Timur' }
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('GlobalLocationSelector', () => {
  it('restores nationwide discovery', () => {
    const onChange = vi.fn();
    render(<GlobalLocationSelector value={{ mode: 'region', label: 'Maduran' }} onChange={onChange}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Lokasi penjelajahan: Maduran' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pilih Semua Lokasi' }));
    expect(onChange).toHaveBeenCalledWith({ mode: 'all', label: 'Semua Lokasi', query: '', coordinates: null });
  });

  it('searches all four region levels in one autocomplete and filters by prefix', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: results }) }));
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    render(<GlobalLocationSelector onChange={onChange}/>);
    fireEvent.click(screen.getByRole('button', { name: /Semua Lokasi/ }));
    const input = screen.getByRole('searchbox', { name: 'Cari wilayah' });
    expect(screen.queryByRole('option')).toBeNull();

    fireEvent.change(input, { target: { value: 'mad' } });
    expect(await screen.findAllByRole('option', { name: /Maduran/ })).toHaveLength(2);
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.click(screen.getByRole('option', { name: /Kecamatan · Kabupaten Lamongan/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'region',
      region: expect.objectContaining({
        scopeLevel: 'district',
        selectedCode: '35.24.10',
        districtCode: '35.24.10',
        regencyCode: '35.24',
        provinceCode: '35'
      })
    }));
  });

  it('allows selecting a province without forcing lower administrative levels', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: results }) })));
    const onChange = vi.fn();
    render(<GlobalLocationSelector onChange={onChange}/>);
    fireEvent.click(screen.getByRole('button', { name: /Semua Lokasi/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari wilayah' }), { target: { value: 'ja' } });
    fireEvent.click(await screen.findByRole('option', { name: /Provinsi/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'region',
      label: 'Jawa Timur',
      region: expect.objectContaining({ scopeLevel: 'province', provinceCode: '35' })
    }));
  });

  it('does not return Maduran when the query is dur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: results }) })));
    render(<GlobalLocationSelector/>);
    fireEvent.click(screen.getByRole('button', { name: /Semua Lokasi/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari wilayah' }), { target: { value: 'dur' } });
    expect(await screen.findByText('Tidak ada wilayah yang diawali “dur”.')).toBeTruthy();
  });

  it('opens the directory map when Jelajahi Peta is selected', () => {
    const onOpenMap = vi.fn();
    render(<GlobalLocationSelector onOpenMap={onOpenMap}/>);
    fireEvent.click(screen.getByRole('button', { name: /Semua Lokasi/ }));
    fireEvent.click(screen.getByRole('button', { name: /Jelajahi Peta/ }));
    expect(onOpenMap).toHaveBeenCalledOnce();
  });

  it('requests GPS only after the user selects Lokasi Saya', () => {
    const onChange = vi.fn();
    const getCurrentPosition = vi.fn(success => success({ coords: { latitude: -7.1, longitude: 112.2 } }));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    render(<GlobalLocationSelector onChange={onChange}/>);
    fireEvent.click(screen.getByRole('button', { name: /Semua Lokasi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gunakan Lokasi Saya' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'nearby', label: 'Lokasi Saya', coordinates: { lat: -7.1, lng: 112.2 }
    }));
  });
});
