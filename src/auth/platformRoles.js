export const PLATFORM_ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  MEMBER: 'member',
});

export function platformRoleFromClaims(claims = {}) {
  // admin:true remains a temporary compatibility path for existing owners.
  if (claims.platformRole === PLATFORM_ROLES.SUPER_ADMIN || claims.admin === true) {
    return PLATFORM_ROLES.SUPER_ADMIN;
  }
  return PLATFORM_ROLES.MEMBER;
}

export function canAccessAdminPanel(role) {
  return role === PLATFORM_ROLES.SUPER_ADMIN;
}
