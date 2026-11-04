import { PLATFORM_BOOTSTRAP_OWNER } from '../../scripts/platform-role-guards.mjs';

export const PLATFORM_OWNER_UID = PLATFORM_BOOTSTRAP_OWNER.uid;

export function isPlatformOwner(user) {
  return Boolean(user && typeof user.uid === 'string' && user.uid === PLATFORM_OWNER_UID);
}
