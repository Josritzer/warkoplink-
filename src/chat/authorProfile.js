export function withPublicAuthorProfile(record, profile) {
  if (!record) return record;
  const publicPhoto = typeof profile?.photoURL === 'string' ? profile.photoURL.trim() : '';
  const historicalPhoto = typeof record.authorPhotoURL === 'string' ? record.authorPhotoURL.trim() : '';
  const publicName = typeof profile?.displayName === 'string' ? profile.displayName.trim() : '';
  return {
    ...record,
    authorPhotoURL: publicPhoto || historicalPhoto || null,
    authorName: publicName || record.authorName || 'Anggota WarkopLink'
  };
}


export function createPublicProfilePhotoPatch({ uid, displayName, photoURL }) {
  const safeUid = typeof uid === 'string' ? uid.trim() : '';
  const safeName = typeof displayName === 'string' ? displayName.trim() : '';
  const safePhotoURL = typeof photoURL === 'string' ? photoURL.trim() : '';
  if (!safeUid || !safeName || !safePhotoURL) {
    throw new Error('Public profile photo requires uid, displayName, and photoURL');
  }
  return { uid: safeUid, displayName: safeName, photoURL: safePhotoURL };
}
