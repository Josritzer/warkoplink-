export function resolveAuthorPhotoURL(record, photosByUid = {}) {
  const uid = record?.authorId;
  return (uid && photosByUid[uid]) || record?.authorPhotoURL || '';
}

export function withAuthorPhotos(records = [], photosByUid = {}) {
  return records.map((record) => ({
    ...record,
    authorPhotoURL: resolveAuthorPhotoURL(record, photosByUid) || null,
  }));
}
