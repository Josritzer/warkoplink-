import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GlobalLocationSelector from './GlobalLocationSelector.jsx';

afterEach(cleanup);

describe('GlobalLocationSelector', () => {
  it('opens the location menu and restores nationwide discovery', () => {
    const onChange = vi.fn();
    render(<GlobalLocationSelector value={{ mode: 'region', label: 'Surabaya', query: 'Surabaya' }} onChange={onChange}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Lokasi penjelajahan: Surabaya' }));
    fireEvent.click(screen.getByRole('button', { name: /Semua Lokasi/ }));
    expect(onChange).toHaveBeenCalledWith({ mode: 'all', label: 'Semua Lokasi', query: '', coordinates: null });
  });

  it('applies a manually entered region', () => {
    const onChange = vi.fn();
    render(<GlobalLocationSelector onChange={onChange}/>);
    fireEvent.click(screen.getByRole('button', { name: /Semua Lokasi/ }));
    fireEvent.change(screen.getByLabelText('Pilih wilayah'), { target: { value: 'Kota Surabaya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
    expect(onChange).toHaveBeenCalledWith({ mode: 'region', label: 'Kota Surabaya', query: 'Kota Surabaya', coordinates: null });
  });

  it('requests GPS only after the user selects Lokasi Saya', () => {
    const onChange = vi.fn();
    const getCurrentPosition = vi.fn(success => success({ coords: { latitude: -7.1, longitude: 112.2 } }));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    render(<GlobalLocationSelector onChange={onChange}/>);
    fireEvent.click(screen.getByRole('button', { name: /Semua Lokasi/ }));
    fireEvent.click(screen.getByRole('button', { name: /Lokasi Saya/ }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'nearby', label: 'Lokasi Saya', coordinates: { lat: -7.1, lng: 112.2 }
    }));
  });
});
