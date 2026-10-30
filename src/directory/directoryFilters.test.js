import { describe, expect, it } from 'vitest';
import { collectActivities, collectFacilities, filterWarungs, isOpenNow, normalizeSearchText } from './directoryFilters.js';

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

  it('fasilitas terpilih harus terpenuhi semuanya', () => {
    expect(filterWarungs(items, { facilities: ['wi-fi'] }).map((i) => i.id)).toEqual(['1', '2']);
    expect(filterWarungs(items, { facilities: ['wi-fi', 'parkir'] }).map((i) => i.id)).toEqual(['1']);
  });

  it('menyaring berdasarkan kisaran harga dan mengabaikan data yang belum mengisinya', () => {
    expect(filterWarungs(items, { priceRange: 'semua' })).toHaveLength(3);
    expect(filterWarungs(items, { priceRange: 'hemat' }).map((i) => i.id)).toEqual(['1']);
    expect(filterWarungs(items, { priceRange: 'sedang' }).map((i) => i.id)).toEqual(['2']);
    expect(filterWarungs(items, { priceRange: 'premium' })).toEqual([]);
    expect(filterWarungs([{ id: 'x', name: 'Tanpa harga', address: 'B' }], { priceRange: 'hemat' })).toEqual([]);
  });

  it('menggabungkan filter harga dengan filter lain', () => {
    expect(filterWarungs(items, { priceRange: 'hemat', facilities: ['parkir'] }).map((i) => i.id)).toEqual(['1']);
    expect(filterWarungs(items, { priceRange: 'sedang', facilities: ['parkir'] })).toEqual([]);
  });

  it('mengumpulkan fasilitas unik tanpa duplikat', () => {
    expect(collectFacilities(items).map((f) => f.key)).toEqual(['parkir', 'wi-fi']);
  });

  it('tahan terhadap data tanpa field fasilitas', () => {
    expect(filterWarungs([{ id: 'x', name: 'A', address: 'B' }], { facilities: ['wi-fi'] })).toEqual([]);
    expect(collectFacilities([{ id: 'x' }, null])).toEqual([]);
  });

  it('memfilter aktivitas berdasarkan field eksplisit dan menggabungkan filter', () => {
    const withActivities = [
      { id: 'a', name: 'Warkop Bola', activities: ['nobar', 'komunitas'] },
      { id: 'b', name: 'Kopi Laptop', activities: ['kerja-laptop'], facilities: ['Wi-Fi'] },
      { id: 'c', name: 'Warung Gim', activities: ['gim'] }
    ];
    expect(filterWarungs(withActivities, { activities: ['nobar'] }).map((item) => item.id)).toEqual(['a']);
    expect(filterWarungs(withActivities, { activities: ['komunitas', 'nobar'] }).map((item) => item.id)).toEqual(['a']);
    expect(filterWarungs(withActivities, { activities: ['nobar'], search: 'laptop' })).toEqual([]);
    expect(collectActivities(withActivities).map((item) => item.key)).toEqual(['nobar', 'komunitas', 'gim', 'kerja-laptop']);
  });

  it('menentukan status buka dari jadwal WIB yang valid dan mendukung lintas tengah malam', () => {
    const week = { mon: { closed: true }, tue: { closed: true }, wed: { closed: true }, thu: { closed: true }, fri: { open: '20:00', close: '02:00' }, sat: { closed: true }, sun: { closed: true } };
    const scheduled = { openingHours: { schedule: week } };
    expect(isOpenNow(scheduled, new Date('2026-10-30T18:00:00.000Z'))).toBe(true); // Sabtu 01.00 WIB, masih dari jadwal Jumat
    expect(isOpenNow(scheduled, new Date('2026-10-30T16:00:00.000Z'))).toBe(true); // Jumat 23.00 WIB
    expect(isOpenNow({ openingHours: { keterangan: 'Setiap hari 08.00–23.00' } }, new Date('2026-10-30T16:00:00.000Z'))).toBe(null);
    expect(isOpenNow({ openingHours: { is24Hours: true } }, new Date('2026-10-30T16:00:00.000Z'))).toBe(true);
    expect(isOpenNow({ openingHours: { schedule: { mon: { closed: true }, tue: { closed: true }, wed: { closed: true }, thu: { closed: true }, fri: { open: '08:00', close: '17:00' }, sat: { closed: true }, sun: { closed: true } } } }, new Date('2026-10-30T16:00:00.000Z'))).toBe(false);
  });
});
