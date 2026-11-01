export const PLATFORM_BOOTSTRAP_OWNER = Object.freeze({
  uid: 'OYgUG5eMWjfmHJ0VLaSXr34H7Dv2',
  email: 'srawungjagad3714@gmail.com',
});

export function isAllowedPlatformBootstrapOwner(uid, email) {
  return uid === PLATFORM_BOOTSTRAP_OWNER.uid
    && typeof email === 'string'
    && email.trim().toLowerCase() === PLATFORM_BOOTSTRAP_OWNER.email;
}
