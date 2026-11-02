import { describe, expect, it } from 'vitest';
import {
  THEMATIC_GROUPS,
  getThematicGroupById,
  isThematicGroupId
} from './thematicGroupCatalog.js';
import { isCommunityId } from '../community/communityCatalog.js';

describe('official WARKOPLINK thematic groups', () => {
  it('defines exactly seven thematic chat rooms with unique stable IDs', () => {
    expect(THEMATIC_GROUPS).toHaveLength(7);
    expect(new Set(THEMATIC_GROUPS.map((group) => group.id)).size).toBe(7);
    expect(THEMATIC_GROUPS.every((group) => group.name && group.description && group.icon)).toBe(true);
  });

  it('uses the seven agreed thematic group identities', () => {
    expect(THEMATIC_GROUPS.map((group) => group.id)).toEqual([
      'pemilik-warkop',
      'pelaku-umkm',
      'info-pekerjaan',
      'event-nobar',
      'komunitas-olahraga',
      'kreator-lokal',
      'jaringan-warga'
    ]);
  });

  it('keeps thematic groups separate from the existing seven communities', () => {
    expect(THEMATIC_GROUPS.every((group) => !isCommunityId(group.id))).toBe(true);
    expect(isCommunityId('ngopi-bareng')).toBe(true);
    expect(isThematicGroupId('ngopi-bareng')).toBe(false);
  });

  it('recognizes only official thematic group IDs', () => {
    expect(isThematicGroupId('pemilik-warkop')).toBe(true);
    expect(isThematicGroupId('jaringan-warga')).toBe(true);
    expect(isThematicGroupId('buat-grup-sendiri')).toBe(false);
    expect(isThematicGroupId('')).toBe(false);
  });

  it('looks up an official thematic group by its stable ID', () => {
    expect(getThematicGroupById('event-nobar')?.name).toBe('Event & Nobar');
    expect(getThematicGroupById('unknown')).toBeNull();
  });
});
