import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GlobalLocationSelector from './GlobalLocationSelector.jsx';

const responses = {
  'provinces.json': [{ id: '35', name: 'Jawa Timur' }],
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

  it('selects a region from the official four-level catalogue instead of accepting free text', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      const key = String(url).split('/v2/')[1];
      return { ok: true, json: async () => ({ data: responses[key] || [] }) };
    }));
    const onChange = vi.fn();
    render(<GlobalLocationSelector onChange={onChange}/>);
    fireEvent.click(screen.getByRole('button', { name: /Semua Lokasi/ }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Provinsi' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Provinsi' }), { target: { value: '35' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Kabupaten/Kota' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Kabupaten/Kota' }), { target: { value: '35.24' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Kecamatan' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Kecamatan' }), { target: { value: '35.24.10' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Desa/Kelurahan' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Desa/Kelurahan' }), { target: { value: '35.24.10.2007' } });
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
