export const PLATFORM_OWNER_UID = 'OYgUG5eMWjfmHJ0VLaSXr34H7Dv2';

export function isPlatformOwner(user) {
  return Boolean(user && typeof user.uid === 'string' && user.uid === PLATFORM_OWNER_UID);
}
