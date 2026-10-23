// Tes Firestore Rules terhadap emulator lokal (project demo, TIDAK menyentuh proyek Firebase asli).
// Jalankan: npm run test:rules  (memerlukan Java + firebase-tools)
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, Timestamp
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

describe('posts', () => {
  it('pengunjung anonim boleh membaca postingan', async () => {
    await assertSucceeds(getDocs(collection(asAnon(), 'posts')));
  });

  it('pengunjung anonim TIDAK boleh membuat postingan', async () => {
    await assertFails(addDoc(collection(asAnon(), 'posts'), validPost()));
  });

  it('pengguna login boleh membuat postingan yang valid', async () => {
    await assertSucceeds(addDoc(collection(asUser('alice'), 'posts'), validPost()));
  });

  it('semua kategori yang diizinkan diterima', async () => {
    for (const topic of ['Obrolan Umum', 'Tanya Jawab', 'Info Layanan', 'Ide & Saran']) {
      await assertSucceeds(addDoc(collection(asUser('alice'), 'posts'), validPost({ topic })));
    }
  });

  it('kategori di luar daftar ditolak', async () => {
    await assertFails(addDoc(collection(asUser('alice'), 'posts'), validPost({ topic: 'Lainnya' })));
  });

  it('isi tepat 2000 karakter diterima, 2001 ditolak, kosong ditolak', async () => {
    const col = collection(asUser('alice'), 'posts');
    await assertSucceeds(addDoc(col, validPost({ body: 'a'.repeat(2000) })));
    await assertFails(addDoc(col, validPost({ body: 'a'.repeat(2001) })));
    await assertFails(addDoc(col, validPost({ body: '' })));
  });

  it('isi 2000 karakter dengan baris baru tetap diterima', async () => {
    await assertSucceeds(
      addDoc(collection(asUser('alice'), 'posts'), validPost({ body: 'a\n'.repeat(1000) }))
    );
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
      addDoc(collection(asUser('alice'), 'posts'), validPost({ createdAt: Timestamp.fromMillis(1000) }))
    );
  });

  it('field tambahan ditolak', async () => {
    await assertFails(addDoc(collection(asUser('alice'), 'posts'), validPost({ isAdmin: true })));
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
