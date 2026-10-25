import { collection, deleteDoc, doc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';

const DELETE_BATCH_SIZE = 450;

// Menandai status lebih dulu agar Rules menghentikan reaksi/balasan baru.
// Jika jaringan gagal, pemilik dapat mengulangi proses dan melanjutkan pembersihan.
export async function deleteOwnPost(db, postId) {
  if (!db || !postId) throw new Error('missing-post-reference');

  const postRef = doc(db, 'posts', postId);
  await updateDoc(postRef, { deleting: true });

  // Reaksi komentar berada di subkoleksi; bersihkan sebelum menghapus dokumen komentar.
  const repliesRef = collection(db, 'posts', postId, 'replies');
  const repliesSnapshot = await getDocs(repliesRef);
  for (const reply of repliesSnapshot.docs) {
    const reactionsRef = collection(db, 'posts', postId, 'replies', reply.id, 'reactions');
    while (true) {
      const reactions = await getDocs(reactionsRef);
      if (reactions.empty) break;
      for (let offset = 0; offset < reactions.docs.length; offset += DELETE_BATCH_SIZE) {
        const batch = writeBatch(db);
        reactions.docs.slice(offset, offset + DELETE_BATCH_SIZE).forEach((item) => batch.delete(item.ref));
        await batch.commit();
      }
    }
  }

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
