import { describe, expect, it } from 'vitest';
import { filterWarungsByLocation } from './locationDiscovery.js';

const warungs = [
  { id: 'maduran', name: 'Kopi Maduran', regencyName: 'Kabupaten Lamongan', coordinates: { lat: -7.0, lng: 112.2 } },
  { id: 'surabaya', name: 'Kedai Surabaya', regencyName: 'Kota Surabaya', coordinates: { lat: -7.25, lng: 112.75 } },
  { id: 'no-coordinates', name: 'Kedai Tanpa Titik', regencyName: 'Kabupaten Lamongan' }
];

describe('filterWarungsByLocation', () => {
  it('keeps the nationwide discovery list when all locations is selected', () => {
    expect(filterWarungsByLocation(warungs, { mode: 'all' }).map(item => item.id))
      .toEqual(['maduran', 'surabaya', 'no-coordinates']);
  });

  it('filters by a manually selected region without changing source records', () => {
    const result = filterWarungsByLocation(warungs, { mode: 'region', query: 'surabaya' });
    expect(result.map(item => item.id)).toEqual(['surabaya']);
    expect(warungs).toHaveLength(3);
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
