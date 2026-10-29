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
  topic: 'Ngopi Bareng',
  createdAt: serverTimestamp(),
  reactions: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
  totalReactions: 0,
  ...overrides,
});

async function createPost(db, post = validPost()) {
  return addDoc(collection(db, 'posts'), post);
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
      authorId: 'alice', authorName: 'Alice', body: 'Postingan Alice', topic: 'Tanya Jawab', createdAt: Timestamp.now(), reactions: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, totalReactions: 0,
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

describe('event RSVPs', () => {
  it('mengizinkan anggota menyimpan RSVP untuk acara dan mengubah statusnya sendiri', async () => {
    const db = asUser('alice');
    const post = await createPost(db, validPost({ topic: 'Info & Acara', eventKind: 'Nobar' }));
    const rsvp = doc(db, 'posts', post.id, 'eventRsvps', 'alice');
    await assertSucceeds(setDoc(rsvp, {
      uid: 'alice', status: 'going', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(rsvp, { status: 'maybe', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(rsvp));
  });

  it('menolak RSVP untuk pengguna lain, status ilegal, atau posting non-acara', async () => {
    const aliceDb = asUser('alice');
    const regularPost = await createPost(aliceDb, validPost({ topic: 'Ngopi Bareng' }));
    await assertFails(setDoc(doc(aliceDb, 'posts', regularPost.id, 'eventRsvps', 'bob'), {
      uid: 'bob', status: 'going', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    const eventPost = await createPost(aliceDb, validPost({ topic: 'Info & Acara' }));
    await assertFails(setDoc(doc(asUser('bob'), 'posts', eventPost.id, 'eventRsvps', 'bob'), {
      uid: 'bob', status: 'maybe-later', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });
});

describe('posts', () => {
  it('menerima penghitung reaksi hanya bersama dokumen reaksi pengguna', async () => {
    const db = asUser('alice');
    const batch = writeBatch(db);
    batch.set(doc(db, 'posts/post-alice/likes/alice'), {
      uid: 'alice', emoji: '👍', createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'posts/post-alice'), {
      'reactions.like': 1, totalReactions: 1,
    });
    await assertSucceeds(batch.commit());
  });

  it('menolak manipulasi penghitung reaksi tanpa reaksi yang cocok', async () => {
    await assertFails(updateDoc(doc(asUser('alice'), 'posts/post-alice'), {
      'reactions.like': 99, totalReactions: 99,
    }));
  });
  it('menerima emoji reaksi tambahan dan menghitungnya ke kategori yang sesuai', async () => {
    const db = asUser('alice');
    const batch = writeBatch(db);
    batch.set(doc(db, 'posts/post-alice/likes/alice'), {
      uid: 'alice', emoji: '👏', createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'posts/post-alice'), {
      'reactions.like': 1, totalReactions: 1,
    });
    await assertSucceeds(batch.commit());
  });

  it('menolak emoji reaksi yang tidak masuk daftar izin', async () => {
    const db = asUser('alice');
    await assertFails(setDoc(doc(db, 'posts/post-alice/likes/alice'), {
      uid: 'alice', emoji: '🚀', createdAt: serverTimestamp(),
    }));
  });


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
    for (const [index, topic] of ['Ngopi Bareng', 'Tanya Warkop', 'Info & Acara', 'Loker', 'Jual Beli & Jasa Lokal'].entries()) {
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
    await assertFails(createPost(asUser('alice'), validPost({ topic: 'Tanya Jawab' })));
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

  it('pengguna boleh mengirim beberapa postingan berturut-turut tanpa jeda paksa', async () => {
    await assertSucceeds(createPost(asUser('alice'), validPost()));
    await assertSucceeds(createPost(asUser('alice'), validPost({ body: 'Obrolan berikutnya langsung' })));
  });

  it('pemilik boleh mengubah isi dan topik postingannya', async () => {
    await assertSucceeds(updateDoc(doc(asUser('alice'), 'posts/post-alice'), { body: 'Diubah', topic: 'Info & Acara' }));
    await assertSucceeds(updateDoc(doc(asUser('alice'), 'posts/post-alice'), { body: 'Diperbarui tanpa migrasi' }));
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

  it('pemilik harus menandai postingan sebelum menghapusnya', async () => {
    await assertFails(deleteDoc(doc(asUser('alice'), 'posts/post-alice')));
    await assertSucceeds(updateDoc(doc(asUser('alice'), 'posts/post-alice'), { deleting: true }));
    await assertSucceeds(deleteDoc(doc(asUser('alice'), 'posts/post-alice')));
  });

  it('pengguna lain tidak dapat menandai postingan untuk dihapus', async () => {
    await assertFails(updateDoc(doc(asUser('bob'), 'posts/post-alice'), { deleting: true }));
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


describe('moderasi laporan obrolan dan audit append-only', () => {
  async function seedReport() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'postReports/post-alice_bob'), {
        targetPostId: 'post-alice', targetAuthorId: 'alice', reporterUid: 'bob',
        reason: 'Spam atau promosi berulang', createdAt: Timestamp.now(),
      });
    });
  }

  async function seedModeration(status = 'Ditinjau') {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'postReportModeration/post-alice_bob'), {
        reportId: 'post-alice_bob', status, updatedBy: 'admin',
        updatedAt: Timestamp.now(), latestAuditId: 'audit-seed',
      });
      await setDoc(doc(db, 'postReportAudit/audit-seed'), {
        reportId: 'post-alice_bob', previousStatus: 'Baru', newStatus: status,
        actorUid: 'admin', note: '', createdAt: Timestamp.now(),
      });
    });
  }

  it('admin dapat mengubah Baru menjadi Ditinjau bersama audit dalam satu batch', async () => {
    await seedReport();
    const db = asAdmin();
    const stateRef = doc(db, 'postReportModeration/post-alice_bob');
    const auditRef = doc(collection(db, 'postReportAudit'));
    const batch = writeBatch(db);
    batch.set(stateRef, {
      reportId: 'post-alice_bob', status: 'Ditinjau', updatedBy: 'admin',
      updatedAt: serverTimestamp(), latestAuditId: auditRef.id,
    });
    batch.set(auditRef, {
      reportId: 'post-alice_bob', previousStatus: 'Baru', newStatus: 'Ditinjau',
      actorUid: 'admin', note: 'Sedang diperiksa', createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(stateRef));
    await assertSucceeds(getDoc(auditRef));
  });

  it('admin dapat menyelesaikan laporan dengan audit yang cocok', async () => {
    await seedReport();
    await seedModeration('Ditinjau');
    const db = asAdmin();
    const stateRef = doc(db, 'postReportModeration/post-alice_bob');
    const auditRef = doc(collection(db, 'postReportAudit'));
    const batch = writeBatch(db);
    batch.update(stateRef, {
      status: 'Selesai', updatedBy: 'admin',
      updatedAt: serverTimestamp(), latestAuditId: auditRef.id,
    });
    batch.set(auditRef, {
      reportId: 'post-alice_bob', previousStatus: 'Ditinjau', newStatus: 'Selesai',
      actorUid: 'admin', note: '', createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it('pengguna biasa dan anonim tidak dapat membaca status atau audit moderasi', async () => {
    await seedReport();
    await seedModeration();
    await assertFails(getDoc(doc(asUser('alice'), 'postReportModeration/post-alice_bob')));
    await assertFails(getDoc(doc(asAnon(), 'postReportModeration/post-alice_bob')));
    await assertFails(getDoc(doc(asUser('alice'), 'postReportAudit/audit-seed')));
    await assertFails(getDoc(doc(asAnon(), 'postReportAudit/audit-seed')));
    await assertSucceeds(getDoc(doc(asAdmin(), 'postReportModeration/post-alice_bob')));
    await assertSucceeds(getDoc(doc(asAdmin(), 'postReportAudit/audit-seed')));
  });

  it('perubahan status tanpa audit atomik ditolak', async () => {
    await seedReport();
    const db = asAdmin();
    await assertFails(setDoc(doc(db, 'postReportModeration/post-alice_bob'), {
      reportId: 'post-alice_bob', status: 'Ditinjau', updatedBy: 'admin',
      updatedAt: serverTimestamp(), latestAuditId: 'audit-missing',
    }));
  });

  it('audit tanpa perubahan status yang cocok ditolak', async () => {
    await seedReport();
    await assertFails(setDoc(doc(asAdmin(), 'postReportAudit/audit-alone'), {
      reportId: 'post-alice_bob', previousStatus: 'Baru', newStatus: 'Ditinjau',
      actorUid: 'admin', note: '', createdAt: serverTimestamp(),
    }));
  });

  it('status tidak boleh mundur atau memakai previousStatus palsu', async () => {
    await seedReport();
    await seedModeration('Ditinjau');
    const db = asAdmin();
    const stateRef = doc(db, 'postReportModeration/post-alice_bob');
    const auditRef = doc(collection(db, 'postReportAudit'));
    const batch = writeBatch(db);
    batch.update(stateRef, {
      status: 'Selesai', updatedBy: 'admin',
      updatedAt: serverTimestamp(), latestAuditId: auditRef.id,
    });
    batch.set(auditRef, {
      reportId: 'post-alice_bob', previousStatus: 'Baru', newStatus: 'Selesai',
      actorUid: 'admin', note: '', createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it('audit tidak dapat diperbarui atau dihapus, status tidak dapat dihapus', async () => {
    await seedReport();
    await seedModeration();
    const adminDb = asAdmin();
    await assertFails(updateDoc(doc(adminDb, 'postReportAudit/audit-seed'), { note: 'Diubah' }));
    await assertFails(deleteDoc(doc(adminDb, 'postReportAudit/audit-seed')));
    await assertFails(deleteDoc(doc(adminDb, 'postReportModeration/post-alice_bob')));
  });

  it('non-admin tidak dapat menulis status atau audit moderasi', async () => {
    await seedReport();
    await assertFails(setDoc(doc(asUser('alice'), 'postReportModeration/post-alice_bob'), {
      reportId: 'post-alice_bob', status: 'Ditinjau', updatedBy: 'alice',
      updatedAt: serverTimestamp(), latestAuditId: 'fake',
    }));
    await assertFails(setDoc(doc(asUser('alice'), 'postReportAudit/fake'), {
      reportId: 'post-alice_bob', previousStatus: 'Baru', newStatus: 'Ditinjau',
      actorUid: 'alice', note: '', createdAt: serverTimestamp(),
    }));
  });
});


describe('pengikut profil warkop', () => {
  async function seedWarung(status = 'verified') {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'warungs/warung-follow'), {
        name: 'Warkop Pojok', nameNormalized: 'warkop pojok', ownerUid: 'owner',
        coordinates: { lat: -7, lng: 112 }, address: 'Jl. Merdeka, Lamongan',
        regionCode: 'lamongan-kab', facilities: [], priceRange: 'hemat',
        openingHours: {}, photos: [], verificationStatus: status,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
    });
  }

  it('pengguna login dapat mengikuti warkop terverifikasi dengan UID sendiri', async () => {
    await seedWarung();
    await assertSucceeds(setDoc(doc(asUser('alice'), 'warungs/warung-follow/followers/alice'), {
      uid: 'alice', createdAt: serverTimestamp(),
    }));
    await assertSucceeds(getDoc(doc(asUser('bob'), 'warungs/warung-follow/followers/alice')));
  });

  it('pengguna tidak dapat mengikuti atas nama akun lain', async () => {
    await seedWarung();
    await assertFails(setDoc(doc(asUser('alice'), 'warungs/warung-follow/followers/bob'), {
      uid: 'bob', createdAt: serverTimestamp(),
    }));
  });

  it('warkop yang belum terverifikasi tidak dapat diikuti', async () => {
    await seedWarung('pending');
    await assertFails(setDoc(doc(asUser('alice'), 'warungs/warung-follow/followers/alice'), {
      uid: 'alice', createdAt: serverTimestamp(),
    }));
  });

  it('pengikut hanya dapat dihapus oleh akun pemilik dokumen', async () => {
    await seedWarung();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'warungs/warung-follow/followers/alice'), {
        uid: 'alice', createdAt: Timestamp.now(),
      });
    });
    await assertFails(deleteDoc(doc(asUser('bob'), 'warungs/warung-follow/followers/alice')));
    await assertSucceeds(deleteDoc(doc(asUser('alice'), 'warungs/warung-follow/followers/alice')));
  });
});
