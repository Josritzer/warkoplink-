// Tes Firestore Rules terhadap emulator lokal (project demo, TIDAK menyentuh proyek Firebase asli).
// Jalankan: npm run test:rules  (memerlukan Java + firebase-tools)
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, Timestamp, writeBatch
} from 'firebase/firestore';

let env;

const validPost = (overrides = {}) => ({
  authorId: 'alice',
  authorName: 'Alice',
  body: 'Halo komunitas',
  topic: 'Obrolan Umum',
  createdAt: serverTimestamp(),
  ...overrides,
});

async function createPost(db, post = validPost()) {
  const postRef = doc(collection(db, 'posts'));
  const rateLimitRef = doc(db, 'postRateLimits', post.authorId);
  const batch = writeBatch(db);
  batch.set(postRef, post);
  batch.set(rateLimitRef, { uid: post.authorId, lastSentAt: serverTimestamp() });
  return batch.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sl-community-rules',
    // Arahkan eksplisit ke emulator CI; jangan pernah fallback ke layanan Firebase asli.
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'profiles/alice'), {
      displayName: 'Alice', email: 'alice@example.test', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'profiles/bob'), {
      displayName: 'Bob', email: 'bob@example.test', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'posts/post-alice'), {
      authorId: 'alice', authorName: 'Alice', body: 'Postingan Alice', topic: 'Tanya Jawab', createdAt: Timestamp.now(),
    });
  });
});

const asAnon = () => env.unauthenticatedContext().firestore();
const asUser = (uid) => env.authenticatedContext(uid).firestore();
const asAdmin = () => env.authenticatedContext('admin', { admin: true }).firestore();

describe('postReports', () => {
  it('pengguna login dapat melaporkan postingan yang ada', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), 'postReports/post-alice_alice'), { targetPostId: 'post-alice', targetAuthorId: 'alice', reporterUid: 'alice', reason: 'Spam atau promosi berulang', createdAt: serverTimestamp() }));
  });
  it('laporan tidak boleh mengaku sebagai pengguna lain', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'postReports/post-alice_bob'), { targetPostId: 'post-alice', targetAuthorId: 'alice', reporterUid: 'bob', reason: 'Spam atau promosi berulang', createdAt: serverTimestamp() }));
  });
  it('laporan untuk postingan yang tidak ada ditolak', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'postReports/missing_alice'), { targetPostId: 'missing', targetAuthorId: 'alice', reporterUid: 'alice', reason: 'Spam atau promosi berulang', createdAt: serverTimestamp() }));
  });
  it('hanya admin yang dapat membaca laporan', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'postReports/post-alice_alice'), { targetPostId: 'post-alice', targetAuthorId: 'alice', reporterUid: 'alice', reason: 'Spam atau promosi berulang', createdAt: Timestamp.now() }); });
    await assertFails(getDoc(doc(asUser('alice'), 'postReports/post-alice_alice')));
    await assertSucceeds(getDoc(doc(asAdmin(), 'postReports/post-alice_alice')));
  });
  it('laporan yang sama tidak dapat dibuat ulang', async () => {
    const ref = doc(asUser('alice'), 'postReports/post-alice_alice');
    await assertSucceeds(setDoc(ref, { targetPostId: 'post-alice', targetAuthorId: 'alice', reporterUid: 'alice', reason: 'Lainnya', createdAt: serverTimestamp() }));
    await assertFails(setDoc(ref, { targetPostId: 'post-alice', targetAuthorId: 'alice', reporterUid: 'alice', reason: 'Lainnya', createdAt: serverTimestamp() }));
  });
});

describe('posts', () => {
  it('pengunjung anonim boleh membaca postingan', async () => {
    await assertSucceeds(getDocs(collection(asAnon(), 'posts')));
  });

  it('pengunjung anonim TIDAK boleh membuat postingan', async () => {
    await assertFails(addDoc(collection(asAnon(), 'posts'), validPost()));
  });

  it('pengguna login boleh membuat postingan yang valid', async () => {
    await assertSucceeds(createPost(asUser('alice'), validPost()));
  });

  it('semua kategori yang diizinkan diterima', async () => {
    for (const [index, topic] of ['Obrolan Umum', 'Tanya Jawab', 'Info Layanan', 'Ide & Saran'].entries()) {
      const uid = `topic-user-${index}`;
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `profiles/${uid}`), {
          displayName: 'Alice', email: `${uid}@example.test`, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
        });
      });
      await assertSucceeds(createPost(asUser(uid), validPost({ authorId: uid, topic })));
    }
  });

  it('kategori di luar daftar ditolak', async () => {
    await assertFails(createPost(asUser('alice'), validPost({ topic: 'Lainnya' })));
  });

  it('isi tepat 2000 karakter diterima, 2001 ditolak, kosong ditolak', async () => {
    await assertSucceeds(createPost(asUser('alice'), validPost({ body: 'a'.repeat(2000) })));
    await assertFails(createPost(asUser('bob'), validPost({ authorId: 'bob', authorName: 'Bob', body: 'a'.repeat(2001) })));
    await assertFails(createPost(asUser('bob'), validPost({ authorId: 'bob', authorName: 'Bob', body: '' })));
  });

  it('isi 2000 karakter dengan baris baru tetap diterima', async () => {
    await assertSucceeds(createPost(asUser('alice'), validPost({ body: 'a\n'.repeat(1000) })));
  });

  it('authorId harus sama dengan uid pengirim', async () => {
    await assertFails(addDoc(collection(asUser('alice'), 'posts'), validPost({ authorId: 'bob' })));
  });

  it('authorName harus sama dengan nama di profil (tidak boleh menyamar)', async () => {
    await assertFails(addDoc(collection(asUser('alice'), 'posts'), validPost({ authorName: 'Bob' })));
  });

  it('pengguna tanpa dokumen profil tidak boleh membuat postingan', async () => {
    await assertFails(
      addDoc(collection(asUser('carol'), 'posts'), validPost({ authorId: 'carol', authorName: 'Carol' }))
    );
  });

  it('createdAt harus waktu server', async () => {
    await assertFails(
      createPost(asUser('alice'), validPost({ createdAt: Timestamp.fromMillis(1000) }))
    );
  });

  it('field tambahan ditolak', async () => {
    await assertFails(createPost(asUser('alice'), validPost({ isAdmin: true })));
  });

  it('postingan kedua dalam jeda 10 detik ditolak oleh aturan server', async () => {
    await assertSucceeds(createPost(asUser('alice'), validPost()));
    await assertFails(createPost(asUser('alice'), validPost({ body: 'Spam kedua' })));
  });

  it('penanda cooldown tidak dapat ditulis untuk pengguna lain', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'postRateLimits/bob'), {
      uid: 'bob', lastSentAt: serverTimestamp(),
    }));
  });

  it('pemilik boleh mengubah isi dan topik postingannya', async () => {
    await assertSucceeds(updateDoc(doc(asUser('alice'), 'posts/post-alice'), { body: 'Diubah', topic: 'Info Layanan' }));
  });

  it('pengguna lain TIDAK boleh mengubah postingan orang lain', async () => {
    await assertFails(updateDoc(doc(asUser('bob'), 'posts/post-alice'), { body: 'Diretas' }));
  });

  it('anonim TIDAK boleh mengubah atau menghapus postingan', async () => {
    await assertFails(updateDoc(doc(asAnon(), 'posts/post-alice'), { body: 'Diretas' }));
    await assertFails(deleteDoc(doc(asAnon(), 'posts/post-alice')));
  });

  it('pemilik tidak boleh mengubah authorId', async () => {
    await assertFails(updateDoc(doc(asUser('alice'), 'posts/post-alice'), { authorId: 'bob' }));
  });

  it('pengguna lain TIDAK boleh menghapus postingan orang lain', async () => {
    await assertFails(deleteDoc(doc(asUser('bob'), 'posts/post-alice')));
  });

  it('pemilik boleh menghapus postingannya', async () => {
    await assertSucceeds(deleteDoc(doc(asUser('alice'), 'posts/post-alice')));
  });
});

describe('profiles', () => {
  it('pemilik boleh membaca profilnya sendiri', async () => {
    await assertSucceeds(getDoc(doc(asUser('alice'), 'profiles/alice')));
  });

  it('pengguna lain dan anonim TIDAK boleh membaca profil', async () => {
    await assertFails(getDoc(doc(asUser('bob'), 'profiles/alice')));
    await assertFails(getDoc(doc(asAnon(), 'profiles/alice')));
  });

  it('pengguna baru boleh membuat profilnya sendiri dengan data valid', async () => {
    await assertSucceeds(setDoc(doc(asUser('dina'), 'profiles/dina'), {
      displayName: 'Dina', email: 'dina@example.test', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });

  it('tidak boleh membuat profil untuk uid lain', async () => {
    await assertFails(setDoc(doc(asUser('dina'), 'profiles/erik'), {
      displayName: 'Erik', email: 'erik@example.test', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });

  it('nama tampilan 1 karakter atau lebih dari 60 karakter ditolak', async () => {
    const base = { email: 'x@example.test', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertFails(setDoc(doc(asUser('dina'), 'profiles/dina'), { ...base, displayName: 'D' }));
    await assertFails(setDoc(doc(asUser('dina'), 'profiles/dina'), { ...base, displayName: 'D'.repeat(61) }));
  });

  it('field tambahan pada profil ditolak', async () => {
    await assertFails(setDoc(doc(asUser('dina'), 'profiles/dina'), {
      displayName: 'Dina', email: 'dina@example.test', role: 'admin', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });

  it('pemilik boleh mengubah displayName tetapi bukan email', async () => {
    await assertSucceeds(updateDoc(doc(asUser('alice'), 'profiles/alice'), { displayName: 'Alice Baru', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser('alice'), 'profiles/alice'), { email: 'baru@example.test' }));
  });

  it('profil tidak boleh dihapus', async () => {
    await assertFails(deleteDoc(doc(asUser('alice'), 'profiles/alice')));
  });
});


const validWarung = (overrides = {}) => ({
  name: 'Warkop Pojok',
  nameNormalized: 'warkop pojok',
  ownerUid: 'alice',
  coordinates: { lat: -7.0, lng: 112.2 },
  address: 'Jl. Contoh No. 12, Lamongan',
  regionCode: 'lamongan-kab',
  facilities: ['wifi', 'parkir'],
  priceRange: 'hemat',
  openingHours: { senin: '08:00-22:00' },
  photos: [],
  verificationStatus: 'pending',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

describe('warungs — direktori aman tahap awal', () => {
  it('pemilik login boleh mendaftarkan warkop berstatus pending', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), 'warungs/warkop-alice'), validWarung()));
  });

  it('pengunjung anonim tidak boleh mendaftarkan warkop', async () => {
    await assertFails(setDoc(doc(asAnon(), 'warungs/warkop-anon'), validWarung({ ownerUid: 'alice' })));
  });

  it('pengguna tidak boleh mendaftarkan warkop atas nama uid lain', async () => {
    await assertFails(setDoc(doc(asUser('bob'), 'warungs/warkop-bob'), validWarung({ ownerUid: 'alice' })));
  });

  it('pemilik tidak dapat mengirim status verified sendiri', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'warungs/warkop-verified'), validWarung({ verificationStatus: 'verified' })));
  });

  it('warkop di luar wilayah awal atau koordinat tidak valid ditolak', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'warungs/warkop-luar'), validWarung({ regionCode: 'surabaya' })));
    await assertFails(setDoc(doc(asUser('alice'), 'warungs/warkop-koordinat'), validWarung({ coordinates: { lat: 200, lng: 112 } })));
  });

  it('field tambahan ditolak agar pemilik tidak dapat menyisipkan role', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'warungs/warkop-role'), validWarung({ isAdmin: true })));
  });

  it('warkop pending hanya dapat dibaca oleh pemiliknya', async () => {
    await setDoc(doc(asUser('alice'), 'warungs/warkop-pending'), validWarung());
    await assertSucceeds(getDoc(doc(asUser('alice'), 'warungs/warkop-pending')));
    await assertFails(getDoc(doc(asUser('bob'), 'warungs/warkop-pending')));
    await assertFails(getDoc(doc(asAnon(), 'warungs/warkop-pending')));
  });

  it('direktori publik boleh membaca warkop verified', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'warungs/warkop-public'), validWarung({
        verificationStatus: 'verified',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }));
    });
    await assertSucceeds(getDoc(doc(asAnon(), 'warungs/warkop-public')));
  });

  it('pemilik tidak dapat mengubah status verifikasi atau pemilik', async () => {
    await setDoc(doc(asUser('alice'), 'warungs/warkop-edit'), validWarung());
    await assertFails(updateDoc(doc(asUser('alice'), 'warungs/warkop-edit'), { verificationStatus: 'verified' }));
    await assertFails(updateDoc(doc(asUser('alice'), 'warungs/warkop-edit'), { ownerUid: 'bob' }));
  });

  it('pemilik dapat memperbarui informasi warkop tanpa mengubah status', async () => {
    await setDoc(doc(asUser('alice'), 'warungs/warkop-edit-ok'), validWarung());
    await assertSucceeds(updateDoc(doc(asUser('alice'), 'warungs/warkop-edit-ok'), {
      name: 'Warkop Pojok Baru',
      nameNormalized: 'warkop pojok baru',
      updatedAt: serverTimestamp(),
    }));
  });

  it('warkop tidak dapat dihapus melalui client', async () => {
    await setDoc(doc(asUser('alice'), 'warungs/warkop-no-delete'), validWarung());
    await assertFails(deleteDoc(doc(asUser('alice'), 'warungs/warkop-no-delete')));
  });
});


describe('verifikasi admin dan audit otomatis', () => {
  async function seedPendingWarung() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'warungs/warkop-audit'), validWarung({
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }));
    });
  }

  it('admin tidak dapat mengubah status tanpa catatan audit atomik', async () => {
    await seedPendingWarung();
    await assertFails(updateDoc(doc(asAdmin(), 'warungs/warkop-audit'), {
      verificationStatus: 'verified',
      verificationAuditId: 'audit-tanpa-catatan',
      updatedAt: serverTimestamp(),
    }));
  });

  it('admin sah dapat mengubah status dan membuat audit dalam satu batch', async () => {
    await seedPendingWarung();
    const db = asAdmin();
    const auditRef = doc(collection(db, 'verificationAudit'));
    const batch = writeBatch(db);
    batch.update(doc(db, 'warungs/warkop-audit'), {
      verificationStatus: 'verified',
      verificationAuditId: auditRef.id,
      updatedAt: serverTimestamp(),
    });
    batch.set(auditRef, {
      warungId: 'warkop-audit',
      warungName: 'Warkop Pojok',
      previousStatus: 'pending',
      newStatus: 'verified',
      actorUid: 'admin',
      reason: 'Informasi sudah diperiksa',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(db, 'verificationAudit', auditRef.id)));
  });

  it('pengguna tanpa klaim admin tidak dapat membuat catatan audit', async () => {
    await seedPendingWarung();
    await assertFails(addDoc(collection(asUser('alice'), 'verificationAudit'), {
      warungId: 'warkop-audit',
      warungName: 'Warkop Pojok',
      previousStatus: 'pending',
      newStatus: 'verified',
      actorUid: 'alice',
      reason: 'Coba mengesahkan sendiri',
      createdAt: serverTimestamp(),
    }));
  });

  it('audit penolakan wajib memiliki alasan yang tidak kosong', async () => {
    await seedPendingWarung();
    const db = asAdmin();
    const auditRef = doc(collection(db, 'verificationAudit'));
    const batch = writeBatch(db);
    batch.update(doc(db, 'warungs/warkop-audit'), {
      verificationStatus: 'rejected',
      verificationAuditId: auditRef.id,
      updatedAt: serverTimestamp(),
    });
    batch.set(auditRef, {
      warungId: 'warkop-audit',
      warungName: 'Warkop Pojok',
      previousStatus: 'pending',
      newStatus: 'rejected',
      actorUid: 'admin',
      reason: '',
      createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it('nama warkop dalam audit harus cocok dengan dokumen yang diputuskan', async () => {
    await seedPendingWarung();
    const db = asAdmin();
    const auditRef = doc(collection(db, 'verificationAudit'));
    const batch = writeBatch(db);
    batch.update(doc(db, 'warungs/warkop-audit'), {
      verificationStatus: 'verified',
      verificationAuditId: auditRef.id,
      updatedAt: serverTimestamp(),
    });
    batch.set(auditRef, {
      warungId: 'warkop-audit',
      warungName: 'Nama Palsu',
      previousStatus: 'pending',
      newStatus: 'verified',
      actorUid: 'admin',
      reason: 'Sudah diperiksa',
      createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it('admin tidak dapat membuat catatan audit tanpa perubahan status yang cocok', async () => {
    await seedPendingWarung();
    await assertFails(addDoc(collection(asAdmin(), 'verificationAudit'), {
      warungId: 'warkop-audit',
      warungName: 'Warkop Pojok',
      previousStatus: 'pending',
      newStatus: 'verified',
      actorUid: 'admin',
      reason: 'Catatan tanpa keputusan',
      createdAt: serverTimestamp(),
    }));
  });

  it('riwayat audit tidak dapat dibaca pengguna biasa', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'verificationAudit/audit-private'), {
        warungId: 'warkop-audit', warungName: 'Warkop Pojok', previousStatus: 'pending',
        newStatus: 'verified', actorUid: 'admin', reason: '', createdAt: Timestamp.now(),
      });
    });
    await assertFails(getDoc(doc(asUser('alice'), 'verificationAudit/audit-private')));
    await assertFails(getDoc(doc(asAnon(), 'verificationAudit/audit-private')));
  });
});
