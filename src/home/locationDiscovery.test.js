import { describe, expect, it } from 'vitest';
import { filterPostsByLocation, filterWarungsByLocation } from './locationDiscovery.js';

const region = {
  provinceCode: '35', provinceName: 'Jawa Timur',
  regencyCode: '35.24', regencyName: 'Kabupaten Lamongan',
  districtCode: '35.24.10', districtName: 'Maduran',
  villageCode: '35.24.10.2007', villageName: 'Maduran'
};
const warungs = [
  { id: 'maduran', name: 'Kopi Maduran', regionCode: '35.24.10.2007', villageCode: '35.24.10.2007', districtCode: '35.24.10', regencyCode: '35.24', provinceCode: '35', regencyName: 'Kabupaten Lamongan', coordinates: { lat: -7.0, lng: 112.2 } },
  { id: 'other-village', name: 'Kedai Desa Tetangga', regionCode: '35.24.10.2008', villageCode: '35.24.10.2008', districtCode: '35.24.10', regencyCode: '35.24', provinceCode: '35', villageName: 'Desa Tetangga', regencyName: 'Kabupaten Lamongan' },
  { id: 'surabaya', name: 'Kedai Surabaya', regencyName: 'Kota Surabaya', coordinates: { lat: -7.25, lng: 112.75 } },
  { id: 'no-coordinates', name: 'Kedai Tanpa Titik', regencyName: 'Kabupaten Lamongan' }
];

describe('filterWarungsByLocation', () => {
  it('keeps the nationwide discovery list when all locations is selected', () => {
    expect(filterWarungsByLocation(warungs, { mode: 'all' }).map(item => item.id))
      .toEqual(['maduran', 'surabaya', 'no-coordinates']);
  });

  it('filters by official administrative codes instead of free-text matching', () => {
    const result = filterWarungsByLocation(warungs, { mode: 'region', region });
    expect(result.map(item => item.id)).toEqual(['maduran']);
  });

  it('keeps legacy text matching available while old records are being normalized', () => {
    const result = filterWarungsByLocation(warungs, { mode: 'region', query: 'surabaya' });
    expect(result.map(item => item.id)).toEqual(['surabaya']);
  });

  it('sorts geolocated warungs by distance from the user and excludes records without coordinates', () => {
    const result = filterWarungsByLocation(warungs, { mode: 'nearby', coordinates: { lat: -7.01, lng: 112.21 } });
    expect(result.map(item => item.id)).toEqual(['maduran', 'surabaya']);
    expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
  });

  it('falls back to the unfiltered list if GPS coordinates are unavailable', () => {
    expect(filterWarungsByLocation(warungs, { mode: 'nearby' })).toEqual(warungs);
  });
});

describe('filterPostsByLocation', () => {
  const posts = [
    { id: 'linked-local', warungId: 'maduran', location: 'Kopi Maduran' },
    { id: 'linked-other', warungId: 'surabaya', location: 'Kedai Surabaya' },
    { id: 'legacy-local', location: 'Acara di Desa Maduran' },
    { id: 'no-location', body: 'Obrolan umum tanpa lokasi' }
  ];

  it('filters linked events and local posts through their warkop administrative identity', () => {
    expect(filterPostsByLocation(posts, { mode: 'region', region }, warungs).map(post => post.id))
      .toEqual(['linked-local', 'legacy-local']);
  });

  it('keeps every post when all locations is selected', () => {
    expect(filterPostsByLocation(posts, { mode: 'all' }, warungs)).toEqual(posts);
  });
});
