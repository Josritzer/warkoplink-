import { deleteDoc, doc } from 'firebase/firestore';

// Firestore Rules tetap menjadi otoritas: hanya authorId pemilik status yang dapat menghapus.
export function deleteOwnPost(db, postId) {
  if (!db || !postId) throw new Error('missing-post-reference');
  return deleteDoc(doc(db, 'posts', postId));
}
