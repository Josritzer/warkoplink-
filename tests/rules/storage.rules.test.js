// Tes Storage Rules terhadap emulator lokal (project demo, TIDAK menyentuh proyek Firebase asli).
// Jalankan: npm run test:rules  (memerlukan Java + firebase-tools).
// Emulator Firestore dan Storage keduanya harus aktif karena aturan Storage membaca dokumen warungs.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

let env;

const MB = 1024 * 1024;
const bytes = (size = 1024) => new Uint8Array(size).fill(1);
const asUser = (uid) => env.authenticatedContext(uid).storage();
const asAnon = () => env.unauthenticatedContext().storage();
const put = (storage, path, { size = 1024, type = 'image/jpeg' } = {}) =>
  uploadBytes(ref(storage, path), bytes(size), { contentType: type });

async function seedObject(path, type = 'image/jpeg') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), bytes(), { contentType: type });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    // Project terpisah dari tes Firestore agar clearFirestore() di sana tidak menghapus data seed di sini.
    projectId: 'demo-sl-community-storage-rules',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 9199, rules: readFileSync('storage.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const warung = (ownerUid, verificationStatus) => ({
      name: 'Warkop Uji', nameNormalized: 'warkop uji', ownerUid, coordinates: { lat: -7.0, lng: 112.2 },
      address: 'Jl. Contoh No. 12, Lamongan', regionCode: 'lamongan-kab', facilities: [], priceRange: 'hemat',
      openingHours: {}, photos: [], verificationStatus, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'warungs/w-pending'), warung('alice', 'pending'));
    await setDoc(doc(db, 'warungs/w-verified'), warung('alice', 'verified'));
    await setDoc(doc(db, 'warungs/w-bob'), warung('bob', 'verified'));
  });
});

describe('foto warkop (warungPhotos)', () => {
  it('pemilik dapat mengunggah ke lima slot, juga saat warkop masih pending', async () => {
    for (let i = 0; i < 5; i += 1) {
      await assertSucceeds(put(asUser('alice'), `warungPhotos/w-pending/photo-${i}`));
    }
  });

  it('menerima JPG, PNG, dan WebP', async () => {
    await assertSucceeds(put(asUser('alice'), 'warungPhotos/w-pending/photo-0', { type: 'image/jpeg' }));
    await assertSucceeds(put(asUser('alice'), 'warungPhotos/w-pending/photo-1', { type: 'image/png' }));
    await assertSucceeds(put(asUser('alice'), 'warungPhotos/w-pending/photo-2', { type: 'image/webp' }));
  });

  it('pengguna lain, pengunjung anonim, dan warkop yang tidak ada ditolak', async () => {
    await assertFails(put(asUser('bob'), 'warungPhotos/w-pending/photo-0'));
    await assertFails(put(asAnon(), 'warungPhotos/w-pending/photo-0'));
    await assertFails(put(asUser('alice'), 'warungPhotos/tidak-ada/photo-0'));
  });

  it('nama berkas di luar photo-0 sampai photo-4 ditolak', async () => {
    await assertFails(put(asUser('alice'), 'warungPhotos/w-pending/photo-5'));
    await assertFails(put(asUser('alice'), 'warungPhotos/w-pending/photo-0.jpg'));
    await assertFails(put(asUser('alice'), 'warungPhotos/w-pending/1730000000000.jpg'));
    await assertFails(put(asUser('alice'), 'warungPhotos/w-pending/photo-0/lagi'));
  });

  it('batas ukuran 2 MB: tepat 2 MB diterima, lebih ditolak, kosong ditolak', async () => {
    await assertSucceeds(put(asUser('alice'), 'warungPhotos/w-pending/photo-0', { size: 2 * MB }));
    await assertFails(put(asUser('alice'), 'warungPhotos/w-pending/photo-1', { size: 2 * MB + 1 }));
    await assertFails(put(asUser('alice'), 'warungPhotos/w-pending/photo-2', { size: 0 }));
  });

  it('tipe selain JPG, PNG, WebP ditolak', async () => {
    for (const type of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/html']) {
      await assertFails(put(asUser('alice'), 'warungPhotos/w-pending/photo-0', { type }));
    }
  });

  it('siapa pun dapat membaca foto warkop', async () => {
    await seedObject('warungPhotos/w-pending/photo-0');
    await assertSucceeds(getBytes(ref(asAnon(), 'warungPhotos/w-pending/photo-0')));
  });

  it('hanya pemilik yang dapat menghapus foto', async () => {
    await seedObject('warungPhotos/w-pending/photo-0');
    await assertFails(deleteObject(ref(asUser('bob'), 'warungPhotos/w-pending/photo-0')));
    await assertFails(deleteObject(ref(asAnon(), 'warungPhotos/w-pending/photo-0')));
    await assertSucceeds(deleteObject(ref(asUser('alice'), 'warungPhotos/w-pending/photo-0')));
  });
});

describe('poster acara (eventPhotos)', () => {
  it('pemilik warkop terverifikasi dapat mengunggah poster', async () => {
    await assertSucceeds(put(asUser('alice'), 'eventPhotos/w-verified/1730000000000.jpg'));
    await assertSucceeds(put(asUser('alice'), 'eventPhotos/w-verified/1730000000001.png', { type: 'image/png' }));
  });

  it('warkop yang belum terverifikasi tidak dapat mengunggah poster', async () => {
    await assertFails(put(asUser('alice'), 'eventPhotos/w-pending/1730000000000.jpg'));
  });

  it('pengguna lain dan pengunjung anonim ditolak', async () => {
    await assertFails(put(asUser('alice'), 'eventPhotos/w-bob/1730000000000.jpg'));
    await assertFails(put(asAnon(), 'eventPhotos/w-verified/1730000000000.jpg'));
  });

  it('nama berkas selain angka waktu dengan ekstensi gambar ditolak', async () => {
    await assertFails(put(asUser('alice'), 'eventPhotos/w-verified/poster.jpg'));
    await assertFails(put(asUser('alice'), 'eventPhotos/w-verified/1730000000000.gif'));
    await assertFails(put(asUser('alice'), 'eventPhotos/w-verified/1730000000000'));
    await assertFails(put(asUser('alice'), 'eventPhotos/w-verified/sub/1730000000000.jpg'));
  });

  it('ukuran lebih dari 2 MB dan tipe non-gambar ditolak', async () => {
    await assertFails(put(asUser('alice'), 'eventPhotos/w-verified/1730000000000.jpg', { size: 2 * MB + 1 }));
    await assertFails(put(asUser('alice'), 'eventPhotos/w-verified/1730000000000.jpg', { type: 'image/gif' }));
  });

  it('siapa pun dapat membaca poster; hanya pemilik yang dapat menghapus', async () => {
    await seedObject('eventPhotos/w-verified/1730000000000.jpg');
    await assertSucceeds(getBytes(ref(asAnon(), 'eventPhotos/w-verified/1730000000000.jpg')));
    await assertFails(deleteObject(ref(asUser('bob'), 'eventPhotos/w-verified/1730000000000.jpg')));
    await assertSucceeds(deleteObject(ref(asUser('alice'), 'eventPhotos/w-verified/1730000000000.jpg')));
  });
});

describe('foto profil (tidak boleh berubah perilakunya)', () => {
  it('pengguna hanya dapat mengunggah avatarnya sendiri', async () => {
    await assertSucceeds(put(asUser('alice'), 'profilePhotos/alice/avatar'));
    await assertFails(put(asUser('bob'), 'profilePhotos/alice/avatar'));
    await assertFails(put(asAnon(), 'profilePhotos/alice/avatar'));
  });

  it('avatar tunduk pada batas tipe dan ukuran', async () => {
    await assertFails(put(asUser('alice'), 'profilePhotos/alice/avatar', { size: 2 * MB + 1 }));
    await assertFails(put(asUser('alice'), 'profilePhotos/alice/avatar', { type: 'image/gif' }));
  });
});
