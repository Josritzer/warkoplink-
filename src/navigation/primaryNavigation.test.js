import { describe, expect, it } from 'vitest';
import { PRIMARY_NAVIGATION } from './primaryNavigation.js';

describe('PRIMARY_NAVIGATION', () => {
  it('defines the five approved WarkopLink destinations in product order', () => {
    expect(PRIMARY_NAVIGATION.map(({ label, section }) => [label, section])).toEqual([
      ['Beranda', 'Beranda'],
      ['Cari Warkop', 'Cari Warkop'],
      ['Obrolan', 'Obrolan'],
      ['Daftarkan Warkop', 'Daftarkan Warkop'],
      ['Akun', 'Akun'],
    ]);
  });

  it('keeps every primary destination unique', () => {
    expect(new Set(PRIMARY_NAVIGATION.map(({ section }) => section)).size).toBe(5);
  });
});
