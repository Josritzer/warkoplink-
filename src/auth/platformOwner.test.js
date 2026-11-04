import { describe, expect, it } from 'vitest';
import { isPlatformOwner, PLATFORM_OWNER_UID } from './platformOwner.js';

describe('platform owner access', () => {
  it('recognizes only the registered platform owner UID', () => {
    expect(isPlatformOwner({ uid: PLATFORM_OWNER_UID })).toBe(true);
  });

  it('rejects a moderator or other signed-in account', () => {
    expect(isPlatformOwner({ uid: 'another-user-uid' })).toBe(false);
  });

  it('rejects a missing or incomplete user', () => {
    expect(isPlatformOwner(null)).toBe(false);
    expect(isPlatformOwner({})).toBe(false);
  });
});
