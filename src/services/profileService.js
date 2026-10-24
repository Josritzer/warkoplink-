// Akses Firestore untuk koleksi `profiles`. Semua fungsi menerima `db` sebagai argumen
// supaya mudah diuji dan tidak bergantung pada React.
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { authorNameFor } from '../lib.js';

export const PROFILES_COLLECTION = 'profiles';

// Membuat dokumen profil milik pengguna (dipakai saat registrasi).
export async function createProfile(db, user, displayName) {
  await setDoc(doc(db, PROFILES_COLLECTION, user.uid), {
    displayName,
    email: user.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// Membuat profil jika akun Auth sudah ada tetapi profil belum tersimpan
// (misalnya pembuatan profil gagal saat registrasi). Aman dipanggil berulang.
// Mengembalikan true bila profil sudah ada/berhasil dibuat, false bila gagal.
export async function ensureProfile(db, user) {
  if (!db || !user) return true;
  try {
    const existing = await getDoc(doc(db, PROFILES_COLLECTION, user.uid));
    if (existing.exists()) return true;
    await createProfile(db, user, authorNameFor(user));
    return true;
  } catch (error) {
    console.warn('Profil belum dapat disimpan:', error?.code || 'unknown');
    return false;
  }
}
