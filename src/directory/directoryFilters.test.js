import { describe, expect, it } from 'vitest';
import { collectFacilities, filterWarungs, mergeWarungs, namePrefixRange, normalizeNameKey, normalizeSearchText } from './directoryFilters.js';

const items = [
  { id: '1', name: 'Warkop Pojok', address: 'Jl. Kembangbahu, Lamongan', facilities: ['Wi-Fi', 'parkir'], priceRange: 'hemat' },
  { id: '2', name: 'Kopi Sudut', address: 'Jl. Veteran', facilities: ['wi-fi'], priceRange: 'sedang' },
  { id: '3', name: 'Warung Tenang', address: 'Babat', facilities: [], priceRange: 'belum-diisi' }
];

describe('directoryFilters', () => {
  it('menormalkan huruf besar dan spasi', () => {
    expect(normalizeSearchText('  Kopí   POJOK ')).toBe('kopi pojok');
  });

  it('tanpa filter mengembalikan semua data', () => {
    expect(filterWarungs(items)).toHaveLength(3);
  });

  it('menyaring berdasarkan kata kunci pada nama, alamat, dan fasilitas', () => {
    expect(filterWarungs(items, { search: 'babat' }).map((i) => i.id)).toEqual(['3']);
    expect(filterWarungs(items, { search: 'parkir' }).map((i) => i.id)).toEqual(['1']);
  });

  it('menyaring berdasarkan kisaran harga', () => {
    expect(filterWarungs(items, { price: 'sedang' }).map((i) => i.id)).toEqual(['2']);
  });

  it('fasilitas terpilih harus terpenuhi semuanya', () => {
    expect(filterWarungs(items, { facilities: ['wi-fi'] }).map((i) => i.id)).toEqual(['1', '2']);
    expect(filterWarungs(items, { facilities: ['wi-fi', 'parkir'] }).map((i) => i.id)).toEqual(['1']);
  });

  it('mengumpulkan fasilitas unik tanpa duplikat', () => {
    expect(collectFacilities(items).map((f) => f.key)).toEqual(['parkir', 'wi-fi']);
  });

  it('tahan terhadap data tanpa field fasilitas', () => {
    expect(filterWarungs([{ id: 'x', name: 'A', address: 'B' }], { facilities: ['wi-fi'] })).toEqual([]);
    expect(collectFacilities([{ id: 'x' }, null])).toEqual([]);
  });
});

describe('pencarian nama server-side', () => {
  it('kunci nama konsisten dengan nilai nameNormalized yang tersimpan (huruf kecil)', () => {
    expect(normalizeNameKey('  Warkop   POJOK ')).toBe('warkop pojok');
    expect(normalizeNameKey('Kopí Sudut')).toBe('kopí sudut');
  });

  it('rentang prefix hanya dibuat untuk kata kunci minimal 2 karakter', () => {
    expect(namePrefixRange('')).toBeNull();
    expect(namePrefixRange(' a ')).toBeNull();
    expect(namePrefixRange(' Warkop  Poj ')).toEqual({ start: 'warkop poj', end: 'warkop poj\uf8ff' });
  });

  it('menggabungkan hasil tanpa duplikat dan terurut berdasarkan nama', () => {
    const merged = mergeWarungs(
      [{ id: 'b', name: 'Bakso', nameNormalized: 'bakso' }, { id: 'c', name: 'Cafe', nameNormalized: 'cafe' }],
      [{ id: 'a', name: 'Angkringan', nameNormalized: 'angkringan' }, { id: 'b', name: 'Bakso', nameNormalized: 'bakso' }]
    );
    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});
