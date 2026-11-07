import { describe, expect, it } from 'vitest';
import { collectSpecialtyMenuOptions } from './specialtyDiscovery.js';

describe('collectSpecialtyMenuOptions', () => {
  it('counts each menu once per warkop and sorts by real coverage', () => {
    const result = collectSpecialtyMenuOptions([
      { specialties: ['Kopi Susu Gula Aren', 'Mi Nyemek', ' kopi susu gula aren '] },
      { specialties: ['Mi Nyemek', 'Pisang Goreng'] },
      { specialties: ['Kopi Susu Gula Aren'] },
    ]);
    expect(result).toEqual([
      { name: 'Kopi Susu Gula Aren', count: 2 },
      { name: 'Mi Nyemek', count: 2 },
      { name: 'Pisang Goreng', count: 1 },
    ]);
  });

  it('ignores empty and non-string menu values', () => {
    expect(collectSpecialtyMenuOptions([
      { specialties: ['', '  ', null, 42, 'Kopi Tubruk'] },
    ])).toEqual([{ name: 'Kopi Tubruk', count: 1 }]);
  });

  it('limits the number of menu suggestions', () => {
    expect(collectSpecialtyMenuOptions([
      { specialties: ['A', 'B', 'C'] },
    ], 2)).toHaveLength(2);
  });

  it('returns an empty list when the loaded directory has no specialty data', () => {
    expect(collectSpecialtyMenuOptions([{ specialties: [] }, {}])).toEqual([]);
  });
});
