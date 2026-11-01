// Assign platform roles only from a trusted local environment.
// Usage:
//   Bootstrap: node scripts/set-platform-role.mjs <UID> super_admin <EXPECTED_EMAIL> --bootstrap --apply
//   Later:     node scripts/set-platform-role.mjs <UID> <moderator|member|super_admin> <EXPECTED_EMAIL> <ACTOR_UID> --apply
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = 'sl-community-platform';
const [uid, role, expectedEmail, actorOrBootstrap, confirmation] = process.argv.slice(2);
const allowedRoles = new Set(['super_admin', 'moderator', 'member']);
const bootstrap = actorOrBootstrap === '--bootstrap';

if (!uid || uid.length < 5 || uid.length > 128 || /\\s/.test(uid)
  || !allowedRoles.has(role) || !expectedEmail || !expectedEmail.includes('@')
  || confirmation !== '--apply' || (bootstrap && role !== 'super_admin') || (!bootstrap && !actorOrBootstrap)) {
  console.error('Argumen tidak valid. Lihat komentar pemakaian pada scripts/set-platform-role.mjs.');
  process.exit(1);
}
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
  console.error(`Ditolak: GCLOUD_PROJECT harus ${projectId}.`);
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();
const account = await auth.getUser(uid);
if ((account.email || '').trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) {
  console.error('Ditolak: email akun Firebase tidak cocok dengan EXPECTED_EMAIL.');
  process.exit(1);
}
if (!account.emailVerified) {
  console.error('Ditolak: email akun Firebase belum terverifikasi.');
  process.exit(1);
}

let actorUid = 'bootstrap';
if (bootstrap) {
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    const anotherSuperAdmin = page.users.find(user =>
      user.uid !== uid && (
        user.customClaims?.platformRole === 'super_admin' || user.customClaims?.admin === true
      )
    );
    if (anotherSuperAdmin) {
      console.error('Ditolak: Super Admin sudah ada. Gunakan ACTOR_UID Super Admin aktif, bukan mode bootstrap.');
      process.exit(1);
    }
    pageToken = page.pageToken;
  } while (pageToken);
}
if (!bootstrap) {
  actorUid = actorOrBootstrap;
  const actor = await auth.getUser(actorUid);
  const actorClaims = actor.customClaims || {};
  if (actorClaims.platformRole !== 'super_admin' && actorClaims.admin !== true) {
    console.error('Ditolak: hanya Super Admin yang dapat menetapkan role.');
    process.exit(1);
  }
}

const claims = { ...(account.customClaims || {}) };
const previousRole = claims.platformRole || (claims.admin === true ? 'super_admin' : 'member');
delete claims.admin; // Klaim lama tidak boleh mempertahankan hak lebih tinggi setelah role diubah.
if (role === 'member') delete claims.platformRole;
else claims.platformRole = role;

await auth.setCustomUserClaims(uid, claims);
try {
  await db.collection('platformRoleAudit').add({
    targetUid: uid,
    targetEmail: account.email,
    previousRole,
    newRole: role,
    actorUid,
    createdAt: FieldValue.serverTimestamp()
  });
} catch (error) {
  // Best-effort rollback prevents a silent role change without its audit record.
  await auth.setCustomUserClaims(uid, account.customClaims || {});
  throw error;
}
console.log(`Role ${role} berhasil disetel untuk UID ${uid} di proyek ${projectId}.`);
console.log('Catatan audit tersimpan. Minta pengguna keluar lalu masuk kembali agar token ID diperbarui.');
