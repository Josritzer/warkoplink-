// Assign platform roles only from a trusted local environment.
// Usage: node scripts/set-platform-role.mjs <UID> <super_admin|moderator|member> <EXPECTED_EMAIL> --apply
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = 'sl-community-platform';
const [uid, role, expectedEmail, confirmation] = process.argv.slice(2);
const allowedRoles = new Set(['super_admin', 'moderator', 'member']);

if (!uid || uid.length < 5 || uid.length > 128 || /\\s/.test(uid)
  || !allowedRoles.has(role) || !expectedEmail || !expectedEmail.includes('@')) {
  console.error('Pemakaian: node scripts/set-platform-role.mjs <UID> <super_admin|moderator|member> <EXPECTED_EMAIL> --apply');
  process.exit(1);
}
if (confirmation !== '--apply') {
  console.error('Mode aman: tidak ada perubahan. Tambahkan --apply setelah memeriksa UID, role, dan email.');
  process.exit(1);
}
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
  console.error(`Ditolak: GCLOUD_PROJECT harus ${projectId}.`);
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const account = await auth.getUser(uid);
if ((account.email || '').trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) {
  console.error('Ditolak: email akun Firebase tidak cocok dengan EXPECTED_EMAIL.');
  process.exit(1);
}
if (!account.emailVerified) {
  console.error('Ditolak: email akun Firebase belum terverifikasi.');
  process.exit(1);
}

const claims = { ...(account.customClaims || {}) };
delete claims.admin; // Lepas klaim lama agar role baru menjadi sumber otorisasi tunggal.
if (role === 'member') delete claims.platformRole;
else claims.platformRole = role;

await auth.setCustomUserClaims(uid, claims);
console.log(`Role ${role} berhasil disetel untuk UID ${uid} di proyek ${projectId}.`);
console.log('Minta pengguna keluar lalu masuk kembali agar token ID diperbarui.');
