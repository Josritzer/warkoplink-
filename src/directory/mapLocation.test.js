import { describe, expect, it } from 'vitest';
import { buildGoogleMapsDirectionsUrl, getMapInitialView, parseMapCoordinates } from './mapLocation.js';

describe('koordinat pemilih lokasi warkop', () => {
  it('membaca koordinat valid yang sudah diisi pengguna', () => {
    expect(parseMapCoordinates('-7.123456', '112.654321')).toEqual([-7.123456, 112.654321]);
  });

  it('menolak koordinat kosong, bukan angka, atau di luar rentang bumi', () => {
    expect(parseMapCoordinates('', '')).toBeNull();
    expect(parseMapCoordinates('abc', '112')).toBeNull();
    expect(parseMapCoordinates('-91', '112')).toBeNull();
    expect(parseMapCoordinates('-7', '181')).toBeNull();
  });

  it('memusatkan peta di koordinat warkop yang sudah tersedia', () => {
    expect(getMapInitialView('-7.123', '112.456')).toEqual({ center: [-7.123, 112.456], zoom: 16 });
  });

  it('memulai dari wilayah Lamongan jika koordinat belum tersedia', () => {
    expect(getMapInitialView('', '')).toEqual({ center: [-7, 112.28], zoom: 12 });
  });

  it('membuka Google Maps ke rute menuju koordinat warkop yang sama', () => {
    const destination = buildGoogleMapsDirectionsUrl('-7.123456', '112.654321');
    const url = new URL(destination);
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('destination')).toBe('-7.123456,112.654321');
    expect(url.searchParams.get('travelmode')).toBe('driving');
    expect(url.searchParams.get('dir_action')).toBe('navigate');
  });

  it('tidak membuat tautan Google Maps jika koordinat tidak valid', () => {
    expect(buildGoogleMapsDirectionsUrl('', '')).toBeNull();
    expect(buildGoogleMapsDirectionsUrl('-91', '112')).toBeNull();
    expect(buildGoogleMapsDirectionsUrl('-7', '181')).toBeNull();
  });
});
