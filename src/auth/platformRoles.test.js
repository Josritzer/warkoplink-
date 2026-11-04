import { describe, expect, it } from 'vitest';
import { canAccessAdminPanel, platformRoleFromClaims, PLATFORM_ROLES } from './platformRoles.js';

describe('platformRoleFromClaims', () => {
  it('recognizes the super admin claim', () => {
    expect(platformRoleFromClaims({ platformRole: 'super_admin' })).toBe(PLATFORM_ROLES.SUPER_ADMIN);
  });
  it('recognizes the moderator claim without granting super admin', () => {
    expect(platformRoleFromClaims({ platformRole: 'moderator' })).toBe(PLATFORM_ROLES.MODERATOR);
  });
  it('keeps legacy admin users as super admin during migration', () => {
    expect(platformRoleFromClaims({ admin: true })).toBe(PLATFORM_ROLES.SUPER_ADMIN);
  });
  it('defaults unknown, missing, or forged profile values to member', () => {
    expect(platformRoleFromClaims({})).toBe(PLATFORM_ROLES.MEMBER);
    expect(platformRoleFromClaims({ role: 'super_admin' })).toBe(PLATFORM_ROLES.MEMBER);
    expect(platformRoleFromClaims({ platformRole: 'owner' })).toBe(PLATFORM_ROLES.MEMBER);
  });
});

describe('canAccessAdminPanel', () => {
  it('allows only the super admin role', () => {
    expect(canAccessAdminPanel(PLATFORM_ROLES.SUPER_ADMIN)).toBe(true);
    expect(canAccessAdminPanel(PLATFORM_ROLES.MODERATOR)).toBe(false);
    expect(canAccessAdminPanel(PLATFORM_ROLES.MEMBER)).toBe(false);
  });
});
