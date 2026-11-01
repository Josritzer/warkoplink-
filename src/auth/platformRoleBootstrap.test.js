import { describe, expect, it } from 'vitest';
import {
  isAllowedPlatformBootstrapOwner,
  PLATFORM_BOOTSTRAP_OWNER,
} from '../../scripts/platform-role-guards.mjs';

describe('platform role bootstrap guard', () => {
  it('allows only the declared application owner UID and email', () => {
    expect(isAllowedPlatformBootstrapOwner(
      PLATFORM_BOOTSTRAP_OWNER.uid,
      PLATFORM_BOOTSTRAP_OWNER.email
    )).toBe(true);
  });

  it('normalizes email case and surrounding whitespace', () => {
    expect(isAllowedPlatformBootstrapOwner(
      PLATFORM_BOOTSTRAP_OWNER.uid,
      '  SRAWUNGJAGAD3714@GMAIL.COM '
    )).toBe(true);
  });

  it('rejects a different UID even when the email matches', () => {
    expect(isAllowedPlatformBootstrapOwner('someone-else-uid', PLATFORM_BOOTSTRAP_OWNER.email)).toBe(false);
  });

  it('rejects a different email even when the UID matches', () => {
    expect(isAllowedPlatformBootstrapOwner(PLATFORM_BOOTSTRAP_OWNER.uid, 'other@example.com')).toBe(false);
  });
});
