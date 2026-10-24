import { collection, deleteDoc, doc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';

const DELETE_BATCH_SIZE = 450;

// Menandai status lebih dulu agar Rules menghentikan reaksi/balasan baru.
// Jika jaringan gagal, pemilik dapat mengulangi proses dan melanjutkan pembersihan.
export async function deleteOwnPost(db, postId) {
  if (!db || !postId) throw new Error('missing-post-reference');

  const postRef = doc(db, 'posts', postId);
  await updateDoc(postRef, { deleting: true });

  for (const childCollection of ['likes', 'replies']) {
    const childRef = collection(db, 'posts', postId, childCollection);
    while (true) {
      const snapshot = await getDocs(childRef);
      if (snapshot.empty) break;

      const batch = writeBatch(db);
      snapshot.docs.slice(0, DELETE_BATCH_SIZE).forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
  }

  await deleteDoc(postRef);
}
