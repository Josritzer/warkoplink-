import { describe, expect, it } from 'vitest';
import { COMMUNITY_GROUPS, getCommunityById, isCommunityId } from './communityCatalog.js';

describe('official WarkopLink communities', () => {
  it('defines exactly seven official groups with unique stable IDs', () => {
    expect(COMMUNITY_GROUPS).toHaveLength(7);
    expect(new Set(COMMUNITY_GROUPS.map((item) => item.id)).size).toBe(7);
    expect(COMMUNITY_GROUPS.every((item) => item.name && item.description && item.icon)).toBe(true);
  });

  it('recognizes only the seven official community IDs', () => {
    expect(isCommunityId('kopi-kuliner')).toBe(true);
    expect(isCommunityId('obrolan-santai')).toBe(true);
    expect(isCommunityId('buat-grup-sendiri')).toBe(false);
    expect(isCommunityId('')).toBe(false);
  });

  it('looks up the official group by its stable ID', () => {
    expect(getCommunityById('bisnis-umkm')?.name).toBe('Bisnis & UMKM');
    expect(getCommunityById('unknown')).toBeNull();
  });
});
