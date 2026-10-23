// Jalankan hanya dari lingkungan tepercaya milik pemilik proyek.
// Tidak menggunakan Cloud Functions dan tidak menyimpan kredensial di repo.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = 'sl-community-platform';
const uid = process.argv[2];

if (!uid || uid.length < 5 || uid.length > 128 || /\s/.test(uid)) {
  console.error('Pemakaian: node scripts/grant-admin.mjs <FIREBASE_AUTH_UID>');
  process.exit(1);
}

if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
  console.error(`Ditolak: GCLOUD_PROJECT harus ${projectId}.`);
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const account = await auth.getUser(uid);
const existingClaims = account.customClaims || {};
await auth.setCustomUserClaims(uid, { ...existingClaims, admin: true });
console.log(`Klaim admin diaktifkan untuk UID ${uid} pada proyek ${projectId}.`);
console.log('Minta pengguna keluar lalu masuk kembali agar token diperbarui.');
