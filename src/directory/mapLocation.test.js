import { describe, expect, it } from 'vitest';
import { getMapInitialView, parseMapCoordinates } from './mapLocation.js';

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
});
