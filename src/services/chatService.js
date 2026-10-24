// Akses Firestore untuk obrolan publik. Semua fungsi menerima `db` sebagai argumen
// supaya mudah diuji dan tidak bergantung pada React.
//
// Nama koleksi dipusatkan di sini. Blueprint WarkopLink merencanakan koleksi `chatMessages`;
// bila nanti bermigrasi, ubah konstanta ini bersamaan dengan firestore.rules dan rencana
// pemindahan data (data lama tidak boleh dihapus otomatis).
import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch
} from 'firebase/firestore';
import { POSTS_LIMIT, authorNameFor } from '../lib.js';

export const POSTS_COLLECTION = 'posts';
export const RATE_LIMIT_COLLECTION = 'postRateLimits';
export const REPORTS_COLLECTION = 'postReports';

// Mendengarkan obrolan terbaru secara langsung. Mengembalikan fungsi untuk berhenti mendengarkan.
export function subscribeToPosts(db, onData, onError, max = POSTS_LIMIT) {
  const postsQuery = query(collection(db, POSTS_COLLECTION), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(
    postsQuery,
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError
  );
}

// Obrolan dan penanda jeda ditulis atomik; Firestore Rules menegakkan jeda 10 detik
// dan menolak bila keduanya tidak ditulis dalam batch yang sama.
export async function publishPost(db, user, { body, topic }) {
  const postRef = doc(collection(db, POSTS_COLLECTION));
  const rateLimitRef = doc(db, RATE_LIMIT_COLLECTION, user.uid);
  const batch = writeBatch(db);
  batch.set(postRef, {
    authorId: user.uid,
    authorName: authorNameFor(user),
    body,
    topic,
    createdAt: serverTimestamp()
  });
  batch.set(rateLimitRef, { uid: user.uid, lastSentAt: serverTimestamp() });
  await batch.commit();
}

// Rules hanya mengizinkan penulis menghapus obrolannya sendiri.
export async function deletePost(db, postId) {
  await deleteDoc(doc(db, POSTS_COLLECTION, postId));
}

// ID dokumen deterministik membatasi satu laporan per akun untuk setiap obrolan.
export async function reportPost(db, user, post, reason) {
  await setDoc(doc(db, REPORTS_COLLECTION, `${post.id}_${user.uid}`), {
    targetPostId: post.id,
    targetAuthorId: post.authorId,
    reporterUid: user.uid,
    reason,
    createdAt: serverTimestamp()
  });
}
