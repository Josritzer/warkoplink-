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


  it('mencari menu utama, menu spesial, dan suasana warkop', () => {
    const rich = [{
      id: 'special',
      name: 'Warkop Senja',
      address: 'Maduran',
      menuItems: ['Mi nyemek'],
      specialties: ['Kopi rempah'],
      ambience: 'Teras sawah dan suasana tenang'
    }];
    expect(filterWarungs(rich, { search: 'kopi rempah' }).map((item) => item.id)).toEqual(['special']);
    expect(filterWarungs(rich, { search: 'teras sawah' }).map((item) => item.id)).toEqual(['special']);
    expect(filterWarungs(rich, { search: 'mi nyemek' }).map((item) => item.id)).toEqual(['special']);
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


describe('kategori penemuan direktori', () => {
  it('menghitung jarak garis lurus dengan haversine dan menolak koordinat invalid', async () => {
    const { getDistanceKm } = await import('./directoryFilters.js');
    expect(getDistanceKm({ lat: -7, lng: 112 }, { lat: -7, lng: 112 })).toBe(0);
    expect(getDistanceKm({ lat: -7, lng: 112 }, { lat: -7, lng: 113 })).toBeCloseTo(111.2, 0);
    expect(getDistanceKm({ lat: 100, lng: 112 }, { lat: -7, lng: 112 })).toBeNull();
  });

  it('mengklasifikasikan event berlangsung, akan datang, selesai, dan dibatalkan', async () => {
    const { getEventLifecycle } = await import('./directoryFilters.js');
    const now = new Date('2026-11-01T12:00:00.000Z');
    expect(getEventLifecycle({ eventStartAt: '2026-11-01T11:00:00.000Z', eventEndAt: '2026-11-01T13:00:00.000Z' }, now)).toBe('ongoing');
    expect(getEventLifecycle({ eventStartAt: '2026-11-01T13:00:00.000Z' }, now)).toBe('upcoming');
    expect(getEventLifecycle({ eventStartAt: '2026-11-01T08:00:00.000Z', eventEndAt: '2026-11-01T09:00:00.000Z' }, now)).toBe('ended');
    expect(getEventLifecycle({ eventStartAt: '2026-11-01T11:00:00.000Z', eventStatus: 'cancelled' }, now)).toBe('cancelled');
  });

  it('mengurutkan empat kategori dari data nyata dan deterministik', async () => {
    const { sortDirectoryWarungs } = await import('./directoryFilters.js');
    const rows = [
      { id: 'a', name: 'A', createdAt: '2026-10-01T00:00:00.000Z', coordinates: { lat: -7, lng: 112 } },
      { id: 'b', name: 'B', createdAt: '2026-10-20T00:00:00.000Z', coordinates: { lat: -7, lng: 112.01 } },
      { id: 'c', name: 'C', createdAt: '2026-10-10T00:00:00.000Z' }
    ];
    expect(sortDirectoryWarungs(rows, 'popular', { followerCounts: { a: 2, b: 8 } }).map(row => row.id)).toEqual(['b', 'a', 'c']);
    expect(sortDirectoryWarungs(rows, 'newest').map(row => row.id)).toEqual(['b', 'c', 'a']);
    expect(sortDirectoryWarungs(rows, 'nearby', { origin: { lat: -7, lng: 112 } }).map(row => row.id)).toEqual(['a', 'b', 'c']);
    const events = [{ id: 'e1', warungId: 'a', eventStartAt: '2026-11-01T11:00:00.000Z', eventEndAt: '2026-11-01T13:00:00.000Z' }];
    expect(sortDirectoryWarungs(rows, 'events', { events, now: new Date('2026-11-01T12:00:00.000Z') }).map(row => row.id)).toEqual(['a']);
  });
});
