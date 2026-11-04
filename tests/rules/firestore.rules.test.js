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
    await setDoc(doc(db, 'publicProfiles/alice'), { uid: 'alice', displayName: 'Alice', photoURL: '', updatedAt: Timestamp.now() });
    await setDoc(doc(db, 'publicProfiles/bob'), { uid: 'bob', displayName: 'Bob', photoURL: '', updatedAt: Timestamp.now() });
    await setDoc(doc(db, 'posts/post-alice'), {
      authorId: 'alice', authorName: 'Alice', body: 'Postingan Alice', topic: 'Tanya Jawab', createdAt: Timestamp.now(), reactions: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, totalReactions: 0,
    });
  });
});

const OWNER_UID = 'OYgUG5eMWjfmHJ0VLaSXr34H7Dv2';
const asAnon = () => env.unauthenticatedContext().firestore();
const asUser = (uid) => env.authenticatedContext(uid).firestore();
const asAdmin = () => env.authenticatedContext(OWNER_UID, { admin: true }).firestore();
const asSuperAdmin = () => env.authenticatedContext(OWNER_UID, { platformRole: 'super_admin' }).firestore();
const asModerator = () => env.authenticatedContext('moderator', { platformRole: 'moderator' }).firestore();

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

describe('member profiles and usernames', () => {
  it('allows a member to reserve a username and update their profile atomically', async () => {
    const db = asUser('alice');
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', 'alice_kopi'), {
      uid: 'alice', username: 'alice_kopi', createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'profiles', 'alice'), {
      username: 'alice_kopi', bio: 'Pecinta kopi', location: 'Maduran',
      interests: ['Ngopi', 'Nobar'], socialLinks: { instagram: 'https://instagram.com/alice' },
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'publicProfiles', 'alice'), {
      uid: 'alice', displayName: 'Alice', photoURL: '', username: 'alice_kopi',
      bio: 'Pecinta kopi', location: 'Maduran', interests: ['Ngopi', 'Nobar'],
      socialLinks: { instagram: 'https://instagram.com/alice' }, updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it('prevents a member from reserving a username for another UID', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'usernames', 'bob_name'), {
      uid: 'bob', username: 'bob_name', createdAt: serverTimestamp(),
    }));
  });

  it('prevents a member from editing another member profile', async () => {
    await assertFails(updateDoc(doc(asUser('alice'), 'profiles', 'bob'), {
      bio: 'Changed by Alice', updatedAt: serverTimestamp(),
    }));
  });

  it('rejects malformed usernames and oversized profile fields', async () => {
    const db = asUser('alice');
    await assertFails(setDoc(doc(db, 'usernames', 'bad.name'), {
      uid: 'alice', username: 'bad.name', createdAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(db, 'profiles', 'alice'), {
      bio: 'x'.repeat(161), updatedAt: serverTimestamp(),
    }));
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

describe('open official conversation categories', () => {
  it('keeps legacy membership records private and read-only while allowing owner cleanup', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'communities/ngopi-bareng/members/alice'), {
        uid: 'alice', createdAt: Timestamp.now()
      });
    });
    const legacyMembership = doc(asUser('alice'), 'communities', 'ngopi-bareng', 'members', 'alice');
    await assertSucceeds(getDoc(legacyMembership));
    await assertFails(getDoc(doc(asUser('bob'), 'communities', 'ngopi-bareng', 'members', 'alice')));
    await assertFails(getDocs(collection(asAnon(), 'communities', 'ngopi-bareng', 'members')));
    await assertFails(getDocs(collection(asUser('bob'), 'communities', 'ngopi-bareng', 'members')));
    await assertFails(setDoc(doc(asUser('alice'), 'communities', 'ngopi-bareng', 'members', 'alice'), {
      uid: 'alice', createdAt: serverTimestamp()
    }));
    await assertFails(deleteDoc(doc(asUser('bob'), 'communities', 'ngopi-bareng', 'members', 'alice')));
    await assertSucceeds(deleteDoc(legacyMembership));
  });

  it('allows posting to any official category without joining and preserves category validation', async () => {
    const aliceDb = asUser('alice');
    await assertSucceeds(createPost(aliceDb, validPost({ communityId: 'ngopi-bareng' })));
    await assertFails(createPost(aliceDb, validPost({ communityId: 'ngopi-bareng', topic: 'Jasa Lokal' })));
    await assertSucceeds(createPost(asUser('bob'), validPost({
      authorId: 'bob', authorName: 'Bob', communityId: 'ngopi-bareng'
    })));
    await assertFails(createPost(aliceDb, validPost({ communityId: 'grup-buatan-sendiri' })));
  });

  it('keeps ordinary posts without communityId working', async () => {
    await assertSucceeds(createPost(asUser('alice'), validPost()));
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

  it('menerima posting video dengan thumbnail JPEG dan nama profil tersimpan yang memiliki spasi persis', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'profiles/alice'), { displayName: '  Alice  ' });
    });
    await assertSucceeds(createPost(asUser('alice'), validPost({
      authorName: '  Alice  ',
      videoThumbnailURL: `data:image/jpeg;base64,${'A'.repeat(1200)}`,
    })));
  });

  it('semua kategori yang diizinkan diterima', async () => {
    for (const [index, topic] of ['Ngopi Bareng', 'Tanya Warkop', 'Info & Acara', 'Loker', 'Jual Beli', 'Jasa Lokal', 'Komunitas & Aktivitas'].entries()) {
      const uid = `topic-user-${index}`;
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `profiles/${uid}`), {
          displayName: 'Alice', email: `${uid}@example.test`, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
        });
      });
      await assertSucceeds(createPost(asUser(uid), validPost({ authorId: uid, topic })));
    }
  });

  it('kategori di luar daftar ditolak dan jenis posting harus sesuai kategori', async () => {
    await assertFails(createPost(asUser('alice'), validPost({ topic: 'Lainnya' })));
    await assertFails(createPost(asUser('alice'), validPost({ topic: 'Tanya Jawab' })));
    await assertFails(createPost(asUser('alice'), validPost({ topic: 'Jasa Lokal', postType: 'Jual barang' })));
    await assertSucceeds(createPost(asUser('alice'), validPost({ topic: 'Jasa Lokal', postType: 'Tawarkan jasa' })));
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
  regionCode: '35.24.10.2007',
  provinceCode: '35', provinceName: 'Jawa Timur',
  regencyCode: '35.24', regencyName: 'Kabupaten Lamongan',
  districtCode: '35.24.10', districtName: 'Maduran',
  villageCode: '35.24.10.2007', villageName: 'Maduran',
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

  it('pemilik dapat menyimpan menu khas dan suasana tanpa mencantumkan kisaran harga', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), 'warungs/warkop-menu'), validWarung({
      priceRange: 'belum-diisi',
      menuItems: ['Kopi', 'Teh', 'Mi instan'],
      specialties: ['Kopi racikan', 'Mi nyemek'],
      ambience: 'Santai untuk ngobrol dan kerja ringan',
    })));
  });


  it('pemilik dapat mendaftarkan warkop dengan kode wilayah resmi empat tingkat', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), 'warungs/warkop-surabaya'), validWarung({
      address: 'Jl. Tunjungan, Surabaya',
      regionCode: '31.74.06.1001',
      provinceCode: '31', provinceName: 'DKI Jakarta',
      regencyCode: '31.74', regencyName: 'Kota Administrasi Jakarta Selatan',
      districtCode: '31.74.06', districtName: 'Cilandak',
      villageCode: '31.74.06.1001', villageName: 'Cipete Selatan',
    })));
  });

  it('menolak slug wilayah bebas untuk pendaftaran baru', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'warungs/warkop-slug'), validWarung({
      regionCode: 'id-jawa-timur-kabupaten-lamongan',
    })));
  });

  it('menolak kode wilayah yang tidak cocok dengan hierarki induknya', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'warungs/warkop-invalid-region'), validWarung({
      regionCode: '35.24.10.2007',
      provinceCode: '35', provinceName: 'Jawa Timur',
      regencyCode: '35.24', regencyName: 'Kabupaten Lamongan',
      districtCode: '35.24.11', districtName: 'Sambeng',
      villageCode: '35.24.10.2007', villageName: 'Maduran',
    })));
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
    await assertSucceeds(updateDoc(doc(asUser('alice'), 'warungs/warkop-edit-ok'), {
      regionCode: '31.74.06.1001',
      provinceCode: '31', provinceName: 'DKI Jakarta',
      regencyCode: '31.74', regencyName: 'Kota Administrasi Jakarta Selatan',
      districtCode: '31.74.06', districtName: 'Cilandak',
      villageCode: '31.74.06.1001', villageName: 'Cipete Selatan',
      address: 'Jl. Cilandak, Jakarta Selatan',
      updatedAt: serverTimestamp(),
    }));
  });

  it('pemilik hanya dapat menambahkan foto warkop dari bucket media dan slot miliknya', async () => {
    const warungId = 'warkop-media-owner';
    await setDoc(doc(asUser('alice'), `warungs/${warungId}`), validWarung());
    const url = `https://klikvxuronunonymmiqv.supabase.co/storage/v1/object/public/warkoplink-media/warungs/${warungId}/0/a12b4567-89ab-4cde-8fab-1234567890ab.webp`;
    await assertSucceeds(updateDoc(doc(asUser('alice'), `warungs/${warungId}`), {
      photos: [url], updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(asUser('alice'), `warungs/${warungId}`), {
      photos: ['https://attacker.example/foreign.webp'], updatedAt: serverTimestamp()
    }));
  });

  it('menolak acara yang mengklaim warkop pending sebagai pemilik', async () => {
    const warungId = 'warkop-event-pending';
    await assertSucceeds(setDoc(doc(asUser('alice'), `warungs/${warungId}`), validWarung()));
    await assertFails(createPost(asUser('alice'), validPost({
      topic: 'Info & Acara', postType: 'Acara Warkop', warungId
    })));
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
      actorUid: OWNER_UID,
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
      actorUid: OWNER_UID,
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
      actorUid: OWNER_UID,
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
      actorUid: OWNER_UID,
      reason: 'Catatan tanpa keputusan',
      createdAt: serverTimestamp(),
    }));
  });

  it('riwayat audit tidak dapat dibaca pengguna biasa', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'verificationAudit/audit-private'), {
        warungId: 'warkop-audit', warungName: 'Warkop Pojok', previousStatus: 'pending',
        newStatus: 'verified', actorUid: OWNER_UID, reason: '', createdAt: Timestamp.now(),
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
        reportId: 'post-alice_bob', status, updatedBy: OWNER_UID,
        updatedAt: Timestamp.now(), latestAuditId: 'audit-seed',
      });
      await setDoc(doc(db, 'postReportAudit/audit-seed'), {
        reportId: 'post-alice_bob', previousStatus: 'Baru', newStatus: status,
        actorUid: OWNER_UID, note: '', createdAt: Timestamp.now(),
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
      reportId: 'post-alice_bob', status: 'Ditinjau', updatedBy: OWNER_UID,
      updatedAt: serverTimestamp(), latestAuditId: auditRef.id,
    });
    batch.set(auditRef, {
      reportId: 'post-alice_bob', previousStatus: 'Baru', newStatus: 'Ditinjau',
      actorUid: OWNER_UID, note: 'Sedang diperiksa', createdAt: serverTimestamp(),
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
      status: 'Selesai', updatedBy: OWNER_UID,
      updatedAt: serverTimestamp(), latestAuditId: auditRef.id,
    });
    batch.set(auditRef, {
      reportId: 'post-alice_bob', previousStatus: 'Ditinjau', newStatus: 'Selesai',
      actorUid: OWNER_UID, note: '', createdAt: serverTimestamp(),
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
      reportId: 'post-alice_bob', status: 'Ditinjau', updatedBy: OWNER_UID,
      updatedAt: serverTimestamp(), latestAuditId: 'audit-missing',
    }));
  });

  it('audit tanpa perubahan status yang cocok ditolak', async () => {
    await seedReport();
    await assertFails(setDoc(doc(asAdmin(), 'postReportAudit/audit-alone'), {
      reportId: 'post-alice_bob', previousStatus: 'Baru', newStatus: 'Ditinjau',
      actorUid: OWNER_UID, note: '', createdAt: serverTimestamp(),
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
      status: 'Selesai', updatedBy: OWNER_UID,
      updatedAt: serverTimestamp(), latestAuditId: auditRef.id,
    });
    batch.set(auditRef, {
      reportId: 'post-alice_bob', previousStatus: 'Baru', newStatus: 'Selesai',
      actorUid: OWNER_UID, note: '', createdAt: serverTimestamp(),
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


describe('mutual follows and private conversations', () => {
  async function seedFollows(mutual = true) {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'userFollows/alice_bob'), { followerUid: 'alice', followedUid: 'bob', createdAt: Timestamp.now() });
      if (mutual) await setDoc(doc(db, 'userFollows/bob_alice'), { followerUid: 'bob', followedUid: 'alice', createdAt: Timestamp.now() });
    });
  }

  async function createConversationAndMessage(senderUid = 'alice', recipientUid = 'bob') {
    const db = asUser(senderUid);
    const participantUids = [senderUid, recipientUid].sort();
    const conversationId = participantUids.join('__');
    const conversationRef = doc(db, 'conversations', conversationId);
    const messageRef = doc(collection(conversationRef, 'messages'));
    const batch = writeBatch(db);
    batch.set(conversationRef, {
      participantUids, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      lastMessagePreview: 'Halo teman', lastMessageAt: serverTimestamp(),
      lastSenderUid: senderUid, lastMessageId: messageRef.id, unreadFor: recipientUid,
    });
    batch.set(messageRef, {
      senderUid, recipientUid, body: 'Halo teman', createdAt: serverTimestamp(), deliveryStatus: 'sent',
    });
    batch.set(doc(db, 'notifications', `message_${messageRef.id}`), {
      recipientUid, actorUid: senderUid, type: 'message', conversationId, messageId: messageRef.id,
      createdAt: serverTimestamp(), readAt: null,
    });
    return { batch, conversationId, messageRef };
  }

  it('membatasi follow satu arah pada akun yang memulai dan menolak follow diri sendiri', async () => {
    const aliceDb = asUser('alice');
    await assertSucceeds(setDoc(doc(aliceDb, 'userFollows/alice_bob'), {
      followerUid: 'alice', followedUid: 'bob', createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(aliceDb, 'userFollows/alice_alice'), {
      followerUid: 'alice', followedUid: 'alice', createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(aliceDb, 'userFollows/bob_alice'), {
      followerUid: 'bob', followedUid: 'alice', createdAt: serverTimestamp(),
    }));
    await assertSucceeds(getDoc(doc(asUser('bob'), 'userFollows/alice_bob')));
    await assertFails(getDoc(doc(asUser('charlie'), 'userFollows/alice_bob')));
  });

  it('mengizinkan percakapan dan notifikasi pesan hanya setelah follow dua arah', async () => {
    await seedFollows(true);
    const { batch, conversationId, messageRef } = await createConversationAndMessage();
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(asUser('bob'), 'conversations', conversationId, 'messages', messageRef.id)));
    await assertFails(getDoc(doc(asUser('charlie'), 'conversations', conversationId, 'messages', messageRef.id)));
    await assertSucceeds(updateDoc(doc(asUser('bob'), 'conversations', conversationId), { unreadFor: '' }));
  });

  it('menolak percakapan pribadi jika follow hanya satu arah', async () => {
    await seedFollows(false);
    const { batch } = await createConversationAndMessage();
    await assertFails(batch.commit());
  });

  it('menolak pesan baru setelah salah satu pihak berhenti mengikuti', async () => {
    await seedFollows(true);
    await assertSucceeds(deleteDoc(doc(asUser('bob'), 'userFollows/bob_alice')));
    const { batch } = await createConversationAndMessage();
    await assertFails(batch.commit());
  });

  it('menolak duplikasi notifikasi pesan dengan ID dokumen yang tidak stabil', async () => {
    await seedFollows(true);
    const { batch, conversationId, messageRef } = await createConversationAndMessage();
    await assertSucceeds(batch.commit());
    await assertFails(setDoc(doc(asUser('alice'), 'notifications/message-duplicate'), {
      recipientUid: 'bob', actorUid: 'alice', type: 'message',
      conversationId, messageId: messageRef.id, createdAt: serverTimestamp(), readAt: null,
    }));
  });

  it('mengizinkan notifikasi teman hanya jika follow sudah dua arah', async () => {
    await seedFollows(true);
    await assertSucceeds(setDoc(doc(asUser('alice'), 'notifications/friend_alice_bob_bob'), {
      recipientUid: 'bob', actorUid: 'alice', type: 'friend', friendUid: 'alice',
      createdAt: serverTimestamp(), readAt: null,
    }));
    await assertFails(setDoc(doc(asUser('alice'), 'notifications/friend-spam-copy'), {
      recipientUid: 'bob', actorUid: 'alice', type: 'friend', friendUid: 'alice',
      createdAt: serverTimestamp(), readAt: null,
    }));
    await assertFails(setDoc(doc(asUser('bob'), 'notifications/friend-fake'), {
      recipientUid: 'alice', actorUid: 'bob', type: 'friend', friendUid: 'alice',
      createdAt: serverTimestamp(), readAt: null,
    }));
  });
});

describe('notifications', () => {
  async function seedMentionTarget() {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'usernames/bob_name'), {
        uid: 'bob', username: 'bob_name', createdAt: Timestamp.now(),
      });
      await updateDoc(doc(db, 'posts/post-alice'), { body: 'Halo @bob_name, sampai jumpa!' });
    });
  }

  it('allows a post author to notify the mapped user mentioned in the post', async () => {
    await seedMentionTarget();
    await assertSucceeds(setDoc(doc(asUser('alice'), 'notifications/mention-valid'), {
      recipientUid: 'bob', actorUid: 'alice', type: 'mention', postId: 'post-alice',
      username: 'bob_name', createdAt: serverTimestamp(), readAt: null,
    }));
  });

  it('rejects a mention notification when the source text does not contain the username', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'usernames/bob_name'), {
        uid: 'bob', username: 'bob_name', createdAt: Timestamp.now(),
      });
    });
    await assertFails(setDoc(doc(asUser('alice'), 'notifications/mention-fake'), {
      recipientUid: 'bob', actorUid: 'alice', type: 'mention', postId: 'post-alice',
      username: 'bob_name', createdAt: serverTimestamp(), readAt: null,
    }));
  });

  it('allows a reply author to notify the username mentioned in that reply', async () => {
    await seedMentionTarget();
    const db = asUser('alice');
    const reply = await addDoc(collection(db, 'posts/post-alice/replies'), {
      authorId: 'alice', authorName: 'Alice', body: 'Hai @bob_name', createdAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(db, 'notifications/reply-mention'), {
      recipientUid: 'bob', actorUid: 'alice', type: 'mention', postId: 'post-alice',
      replyId: reply.id, username: 'bob_name', createdAt: serverTimestamp(), readAt: null,
    }));
  });

  it('allows a reply author to notify the owner of the parent post about a new comment', async () => {
    const db = asUser('bob');
    const reply = await addDoc(collection(db, 'posts/post-alice/replies'), {
      authorId: 'bob', authorName: 'Bob', body: 'Saya setuju', createdAt: serverTimestamp(),
    });
    const notification = doc(db, 'notifications/comment-for-alice');
    await assertSucceeds(setDoc(notification, {
      recipientUid: 'alice', actorUid: 'bob', type: 'comment', postId: 'post-alice',
      replyId: reply.id, createdAt: serverTimestamp(), readAt: null,
    }));
    await assertSucceeds(getDoc(doc(asUser('alice'), 'notifications/comment-for-alice')));
    await assertFails(getDoc(doc(asUser('bob'), 'notifications/comment-for-alice')));
  });

  it('allows a post owner to receive a notification when another member reacts', async () => {
    const db = asUser('bob');
    await assertSucceeds(setDoc(doc(db, 'posts/post-alice/likes/bob'), {
      uid: 'bob', emoji: '❤️', createdAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(db, 'notifications/reaction-for-alice'), {
      recipientUid: 'alice', actorUid: 'bob', type: 'reaction', postId: 'post-alice',
      createdAt: serverTimestamp(), readAt: null,
    }));
  });

  it('allows a verified warung owner to receive a new-follower notification', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'warungs/verified-warung'), validWarung({
        ownerUid: 'alice', verificationStatus: 'verified',
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      }));
    });
    const db = asUser('bob');
    await assertSucceeds(setDoc(doc(db, 'warungs/verified-warung/followers/bob'), {
      uid: 'bob', createdAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(db, 'notifications/follow-for-alice'), {
      recipientUid: 'alice', actorUid: 'bob', type: 'follow', warungId: 'verified-warung',
      createdAt: serverTimestamp(), readAt: null,
    }));
  });

  it('only the recipient can mark a notification as read or delete it', async () => {
    const db = asUser('bob');
    const reply = await addDoc(collection(db, 'posts/post-alice/replies'), {
      authorId: 'bob', authorName: 'Bob', body: 'Komentar', createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'notifications/comment-read-test'), {
      recipientUid: 'alice', actorUid: 'bob', type: 'comment', postId: 'post-alice',
      replyId: reply.id, createdAt: serverTimestamp(), readAt: null,
    });
    await assertSucceeds(updateDoc(doc(asUser('alice'), 'notifications/comment-read-test'), { readAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser('bob'), 'notifications/comment-read-test'), { readAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(asUser('bob'), 'notifications/comment-read-test')));
  });
});


describe('peran platform', () => {
  it('moderator tidak dapat membaca laporan privat platform', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'postReports/post-alice_bob'), {
        targetPostId: 'post-alice', targetAuthorId: 'alice', reporterUid: 'bob',
        reason: 'Spam atau promosi berulang', createdAt: Timestamp.now(),
      });
    });
    await assertFails(getDoc(doc(asModerator(), 'postReports/post-alice_bob')));
  });

  it('moderator tidak dapat membaca audit verifikasi pendaftaran warkop', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'verificationAudit/audit-seed'), {
        warungId: 'warung-1', warungName: 'Warkop Pojok', previousStatus: 'pending',
        newStatus: 'verified', actorUid: OWNER_UID, reason: '', createdAt: Timestamp.now(),
      });
    });
    await assertFails(getDoc(doc(asModerator(), 'verificationAudit/audit-seed')));
  });

  it('moderator tidak dapat memperbarui status laporan atau membuat audit', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'postReports/post-alice_bob'), {
        targetPostId: 'post-alice', targetAuthorId: 'alice', reporterUid: 'bob',
        reason: 'Spam atau promosi berulang', createdAt: Timestamp.now(),
      });
    });
    const db = asModerator();
    const stateRef = doc(db, 'postReportModeration/post-alice_bob');
    const auditRef = doc(db, 'postReportAudit/moderator-audit');
    const batch = writeBatch(db);
    batch.set(stateRef, {
      reportId: 'post-alice_bob', status: 'Ditinjau', updatedBy: 'moderator',
      updatedAt: serverTimestamp(), latestAuditId: auditRef.id,
    });
    batch.set(auditRef, {
      reportId: 'post-alice_bob', previousStatus: 'Baru', newStatus: 'Ditinjau',
      actorUid: 'moderator', note: '', createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it('moderator tidak dapat memverifikasi pendaftaran warkop meski audit disertakan', async () => {
    const ownerDb = asUser('alice');
    await setDoc(doc(ownerDb, 'warungs/role-warung'), validWarung());
    const db = asModerator();
    const auditRef = doc(db, 'verificationAudit/moderator-forbidden');
    const batch = writeBatch(db);
    batch.update(doc(db, 'warungs/role-warung'), {
      verificationStatus: 'verified', verificationAuditId: auditRef.id, updatedAt: serverTimestamp(),
    });
    batch.set(auditRef, {
      warungId: 'role-warung', warungName: 'Warkop Pojok', previousStatus: 'pending',
      newStatus: 'verified', actorUid: 'moderator', reason: '', createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it('super admin dapat membaca laporan dan audit verifikasi', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'postReports/post-alice_bob'), {
        targetPostId: 'post-alice', targetAuthorId: 'alice', reporterUid: 'bob',
        reason: 'Spam atau promosi berulang', createdAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'verificationAudit/audit-seed'), {
        warungId: 'warung-1', warungName: 'Warkop Pojok', previousStatus: 'pending',
        newStatus: 'verified', actorUid: OWNER_UID, reason: '', createdAt: Timestamp.now(),
      });
    });
    await assertSucceeds(getDoc(doc(asSuperAdmin(), 'postReports/post-alice_bob')));
    await assertSucceeds(getDoc(doc(asSuperAdmin(), 'verificationAudit/audit-seed')));
  });
});


describe('thematic group membership and chat', () => {
  const memberRef = (db, groupId, uid) => doc(db, 'thematicGroups', groupId, 'members', uid);
  const messageRef = (db, groupId, messageId) => doc(db, 'thematicGroups', groupId, 'messages', messageId);
  const joinGroup = (db, groupId = 'pemilik-warkop', uid = 'alice') => setDoc(
    memberRef(db, groupId, uid),
    { uid, joinedAt: serverTimestamp(), lastReadAt: serverTimestamp() }
  );
  const validGroupMessage = (overrides = {}) => ({
    senderUid: 'alice',
    senderName: 'Alice',
    text: 'Halo, teman-teman warkop!',
    createdAt: serverTimestamp(),
    ...overrides,
  });

  it('anggota dapat bergabung, memperbarui penanda baca sendiri, dan keluar', async () => {
    const db = asUser('alice');
    const membership = memberRef(db, 'pemilik-warkop', 'alice');
    await assertSucceeds(joinGroup(db));
    await assertSucceeds(getDoc(membership));
    await assertSucceeds(updateDoc(membership, { lastReadAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(membership));
  });

  it('menolak grup tidak resmi, identitas anggota palsu, dan field peran admin', async () => {
    const db = asUser('alice');
    await assertFails(joinGroup(db, 'grup-buatan-sendiri'));
    await assertFails(setDoc(memberRef(db, 'pemilik-warkop', 'bob'), {
      uid: 'bob', joinedAt: serverTimestamp(), lastReadAt: serverTimestamp()
    }));
    await assertFails(setDoc(memberRef(db, 'pemilik-warkop', 'alice'), {
      uid: 'alice', joinedAt: serverTimestamp(), lastReadAt: serverTimestamp(), role: 'admin'
    }));
  });

  it('dokumen keanggotaan hanya dapat dibaca pemiliknya dan daftar UID tidak terbuka', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pemilik-warkop/members/alice'), {
        uid: 'alice', joinedAt: Timestamp.now(), lastReadAt: Timestamp.now()
      });
    });
    await assertSucceeds(getDoc(memberRef(asUser('alice'), 'pemilik-warkop', 'alice')));
    await assertFails(getDoc(memberRef(asUser('bob'), 'pemilik-warkop', 'alice')));
    await assertFails(getDocs(collection(asUser('bob'), 'thematicGroups', 'pemilik-warkop', 'members')));
    await assertFails(deleteDoc(memberRef(asUser('bob'), 'pemilik-warkop', 'alice')));
  });

  it('hanya anggota yang bergabung dapat membaca riwayat pesan', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pemilik-warkop/messages/old-message'), {
        senderUid: 'alice', senderName: 'Alice', text: 'Riwayat lama', createdAt: Timestamp.now()
      });
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pemilik-warkop/members/alice'), {
        uid: 'alice', joinedAt: Timestamp.now(), lastReadAt: Timestamp.now()
      });
    });
    await assertSucceeds(getDoc(messageRef(asUser('alice'), 'pemilik-warkop', 'old-message')));
    await assertFails(getDoc(messageRef(asUser('bob'), 'pemilik-warkop', 'old-message')));
    await assertFails(getDoc(messageRef(asAnon(), 'pemilik-warkop', 'old-message')));
  });

  it('anggota dapat mengirim pesan teks dengan identitas dan waktu server yang valid', async () => {
    const db = asUser('alice');
    await joinGroup(db);
    await assertSucceeds(setDoc(messageRef(db, 'pemilik-warkop', 'message-1'), validGroupMessage()));
  });

  it('menolak pesan dari nonanggota, penyamaran UID/nama, pesan kosong, dan pesan terlalu panjang', async () => {
    const aliceDb = asUser('alice');
    await joinGroup(aliceDb);
    await assertFails(setDoc(messageRef(asUser('bob'), 'pemilik-warkop', 'not-member'), validGroupMessage({
      senderUid: 'bob', senderName: 'Bob'
    })));
    await assertFails(setDoc(messageRef(aliceDb, 'pemilik-warkop', 'spoof-uid'), validGroupMessage({ senderUid: 'bob' })));
    await assertFails(setDoc(messageRef(aliceDb, 'pemilik-warkop', 'spoof-name'), validGroupMessage({ senderName: 'Bob' })));
    await assertFails(setDoc(messageRef(aliceDb, 'pemilik-warkop', 'empty'), validGroupMessage({ text: '' })));
    await assertFails(setDoc(messageRef(aliceDb, 'pemilik-warkop', 'too-long'), validGroupMessage({ text: 'x'.repeat(2001) })));
  });

  it('menolak timestamp palsu dan field tambahan pada pesan', async () => {
    const db = asUser('alice');
    await joinGroup(db);
    await assertFails(setDoc(messageRef(db, 'pemilik-warkop', 'fake-time'), validGroupMessage({
      createdAt: Timestamp.fromMillis(1000)
    })));
    await assertFails(setDoc(messageRef(db, 'pemilik-warkop', 'extra-field'), validGroupMessage({
      isAdmin: true
    })));
  });

  it('riwayat pesan tetap tersedia setelah anggota keluar lalu bergabung kembali', async () => {
    const db = asUser('alice');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pemilik-warkop/messages/old-message'), {
        senderUid: 'alice', senderName: 'Alice', text: 'Pesan sebelum keluar', createdAt: Timestamp.now()
      });
    });
    await joinGroup(db);
    await assertSucceeds(getDoc(messageRef(db, 'pemilik-warkop', 'old-message')));
    await assertSucceeds(deleteDoc(memberRef(db, 'pemilik-warkop', 'alice')));
    await assertFails(getDoc(messageRef(db, 'pemilik-warkop', 'old-message')));
    await joinGroup(db);
    await assertSucceeds(getDoc(messageRef(db, 'pemilik-warkop', 'old-message')));
  });

  it('pesan yang sudah terkirim tidak dapat diubah atau dihapus oleh anggota', async () => {
    const db = asUser('alice');
    await joinGroup(db);
    const message = messageRef(db, 'pemilik-warkop', 'message-immutable');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pemilik-warkop/messages/message-immutable'), {
        senderUid: 'alice', senderName: 'Alice', text: 'Pesan tetap', createdAt: Timestamp.now()
      });
    });
    await assertFails(updateDoc(message, { text: 'Diubah' }));
    await assertFails(deleteDoc(message));
  });

  it('anggota dapat membalas pesan yang ada di grup yang sama', async () => {
    const db = asUser('alice');
    await joinGroup(db);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pemilik-warkop/messages/original-message'), {
        senderUid: 'bob', senderName: 'Bob', text: 'Ada rekomendasi kopi?', createdAt: Timestamp.now()
      });
    });
    await assertSucceeds(setDoc(messageRef(db, 'pemilik-warkop', 'reply-message'), validGroupMessage({
      text: 'Saya punya rekomendasi.',
      replyToMessageId: 'original-message'
    })));
  });

  it('menolak balasan ke pesan yang tidak ada atau berada di grup lain', async () => {
    const db = asUser('alice');
    await joinGroup(db);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pelaku-umkm/messages/foreign-message'), {
        senderUid: 'bob', senderName: 'Bob', text: 'Pesan grup lain', createdAt: Timestamp.now()
      });
    });
    await assertFails(setDoc(messageRef(db, 'pemilik-warkop', 'missing-reply'), validGroupMessage({
      replyToMessageId: 'message-yang-tidak-ada'
    })));
    await assertFails(setDoc(messageRef(db, 'pemilik-warkop', 'foreign-reply'), validGroupMessage({
      replyToMessageId: 'foreign-message'
    })));
  });


  it('anggota dapat memberi, mengganti, dan menghapus reaksi miliknya pada pesan grup', async () => {
    const db = asUser('alice');
    await joinGroup(db);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pemilik-warkop/messages/reactable'), {
        senderUid: 'bob', senderName: 'Bob', text: 'Halo', createdAt: Timestamp.now()
      });
    });
    const reaction = doc(db, 'thematicGroups/pemilik-warkop/reactions/reactable_alice');
    await assertSucceeds(setDoc(reaction, {
      messageId: 'reactable', uid: 'alice', emoji: '👍', updatedAt: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(reaction, { emoji: '❤️', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(reaction));
  });

  it('menolak reaksi nonanggota, emoji di luar daftar, UID palsu, dan pesan yang tidak ada', async () => {
    const aliceDb = asUser('alice');
    await joinGroup(aliceDb);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pemilik-warkop/messages/reactable'), {
        senderUid: 'bob', senderName: 'Bob', text: 'Halo', createdAt: Timestamp.now()
      });
    });
    await assertFails(setDoc(doc(asUser('bob'), 'thematicGroups/pemilik-warkop/reactions/reactable_bob'), {
      messageId: 'reactable', uid: 'bob', emoji: '👍', updatedAt: serverTimestamp()
    }));
    await assertFails(setDoc(doc(aliceDb, 'thematicGroups/pemilik-warkop/reactions/reactable_alice'), {
      messageId: 'reactable', uid: 'alice', emoji: '💣', updatedAt: serverTimestamp()
    }));
    await assertFails(setDoc(doc(aliceDb, 'thematicGroups/pemilik-warkop/reactions/reactable_bob'), {
      messageId: 'reactable', uid: 'bob', emoji: '👍', updatedAt: serverTimestamp()
    }));
    await assertFails(setDoc(doc(aliceDb, 'thematicGroups/pemilik-warkop/reactions/missing_alice'), {
      messageId: 'missing', uid: 'alice', emoji: '👍', updatedAt: serverTimestamp()
    }));
  });

  it('anggota dapat membuat notifikasi mention grup yang didukung pesan dan username terdaftar', async () => {
    const aliceDb = asUser('alice');
    await joinGroup(aliceDb);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'usernames/budi'), { uid: 'budi', username: 'budi', createdAt: Timestamp.now() });
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pemilik-warkop/messages/mention-message'), {
        senderUid: 'alice', senderName: 'Alice', text: 'Halo @budi, selamat datang!', mentionedUsernames: ['budi'], createdAt: Timestamp.now()
      });
    });
    await assertSucceeds(setDoc(doc(aliceDb, 'notifications/group_mention_mention-message_budi'), {
      recipientUid: 'budi', actorUid: 'alice', type: 'mention', groupId: 'pemilik-warkop',
      messageId: 'mention-message', username: 'budi', createdAt: serverTimestamp(), readAt: null
    }));
  });

  it('menolak mention grup palsu, penerima yang tidak cocok, dan mention yang tidak tertulis', async () => {
    const aliceDb = asUser('alice');
    await joinGroup(aliceDb);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'usernames/budi'), { uid: 'budi', username: 'budi', createdAt: Timestamp.now() });
      await setDoc(doc(ctx.firestore(), 'usernames/citra'), { uid: 'citra', username: 'citra', createdAt: Timestamp.now() });
      await setDoc(doc(ctx.firestore(), 'thematicGroups/pemilik-warkop/messages/mention-message'), {
        senderUid: 'alice', senderName: 'Alice', text: 'Halo @budi!', mentionedUsernames: ['budi'], createdAt: Timestamp.now()
      });
    });
    const valid = {
      recipientUid: 'budi', actorUid: 'alice', type: 'mention', groupId: 'pemilik-warkop',
      messageId: 'mention-message', username: 'budi', createdAt: serverTimestamp(), readAt: null
    };
    await assertFails(setDoc(doc(aliceDb, 'notifications/wrong-recipient'), { ...valid, recipientUid: 'citra' }));
    await assertFails(setDoc(doc(aliceDb, 'notifications/wrong-text'), { ...valid, username: 'citra', recipientUid: 'citra' }));
    await assertFails(setDoc(doc(aliceDb, 'notifications/wrong-group'), { ...valid, groupId: 'not-a-group' }));
  });

});
