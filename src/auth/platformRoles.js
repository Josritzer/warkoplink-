export const PLATFORM_ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  MODERATOR: 'moderator',
  MEMBER: 'member',
});

export function platformRoleFromClaims(claims = {}) {
  // admin:true remains a temporary compatibility path for existing owners.
  if (claims.platformRole === PLATFORM_ROLES.SUPER_ADMIN || claims.admin === true) {
    return PLATFORM_ROLES.SUPER_ADMIN;
  }
  if (claims.platformRole === PLATFORM_ROLES.MODERATOR) {
    return PLATFORM_ROLES.MODERATOR;
  }
  return PLATFORM_ROLES.MEMBER;
}

export function canAccessAdminPanel(role) {
  return role === PLATFORM_ROLES.SUPER_ADMIN || role === PLATFORM_ROLES.MODERATOR;
}
