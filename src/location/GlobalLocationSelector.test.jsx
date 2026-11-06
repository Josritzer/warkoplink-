import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GlobalLocationSelector from './GlobalLocationSelector.jsx';
import { clearOfficialRegionCache } from '../directory/OfficialRegionPicker.jsx';

const responses = {
  'provinces.json': [{ id: '35', name: 'Jawa Timur' }, { id: '33', name: 'Jawa Tengah' }],
  'regencies/35.json': [{ id: '35.24', name: 'Kabupaten Lamongan' }],
  'districts/35.24.json': [{ id: '35.24.10', name: 'Maduran' }],
  'villages/35.24.10.json': [{ id: '35.24.10.2007', name: 'Maduran' }]
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('GlobalLocationSelector', () => {
  it('opens the location menu and restores nationwide discovery', () => {
    const onChange = vi.fn();
    render(<GlobalLocationSelector value={{ mode: 'region', label: 'Maduran' }} onChange={onChange}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Lokasi penjelajahan: Maduran' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pilih Semua Lokasi' }));
    expect(onChange).toHaveBeenCalledWith({ mode: 'all', label: 'Semua Lokasi', query: '', coordinates: null });
  });

  it('uses one search field to select the four official region levels in sequence', async () => {
    clearOfficialRegionCache();
    vi.stubGlobal('fetch', vi.fn(async url => {
      const key = String(url).split('/v2/')[1];
      return { ok: true, json: async () => ({ data: responses[key] || [] }) };
    }));
    const onChange = vi.fn();
    render(<GlobalLocationSelector onChange={onChange}/>);
    fireEvent.click(screen.getByRole('button', { name: /Semua Lokasi/ }));

    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Cari provinsi' })).toBeTruthy());
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari provinsi' }), { target: { value: 'tim' } });
    expect(await screen.findByText('Tidak ada lokasi yang diawali “tim”.')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari provinsi' }), { target: { value: 'ja' } });
    expect(await screen.findByRole('option', { name: 'Jawa Timur' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Jawa Tengah' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'Jawa Timur' }));

    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Cari kabupaten/kota' })).toBeTruthy());
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari kabupaten/kota' }), { target: { value: 'kab' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Kabupaten Lamongan' }));

    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Cari kecamatan' })).toBeTruthy());
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari kecamatan' }), { target: { value: 'mad' } });
    fireEvent.click(screen.getByRole('button', { name: /Kembali/ }));
    expect(screen.getByText('Jawa Timur › Kabupaten Lamongan')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari kabupaten/kota' }), { target: { value: 'kab' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Kabupaten Lamongan' }));

    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Cari kecamatan' })).toBeTruthy());
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari kecamatan' }), { target: { value: 'mad' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Maduran' }));

    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Cari desa/kelurahan' })).toBeTruthy());
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari desa/kelurahan' }), { target: { value: 'mad' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Maduran' }));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'region',
      region: expect.objectContaining({
        provinceCode: '35', regencyCode: '35.24',
        districtCode: '35.24.10', villageCode: '35.24.10.2007'
      })
    })));
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
