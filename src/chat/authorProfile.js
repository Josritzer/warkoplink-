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
