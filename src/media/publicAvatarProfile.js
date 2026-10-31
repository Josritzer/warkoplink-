export function publicAvatarProfile(uid, displayName, photoURL) {
  return {
    uid,
    displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : 'Anggota WarkopLink',
    photoURL: typeof photoURL === 'string' ? photoURL.trim() : ''
  };
}
