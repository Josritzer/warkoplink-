// Storage Rules tests run only against the Firebase emulators (demo project).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

let env;
let sequence = 0;

const nextId = (prefix) => `${prefix}-${Date.now()}-${++sequence}`;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sl-community-rules',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync('storage.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

async function seedWarung(warungId, ownerUid = 'alice', verificationStatus = 'pending') {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `warungs/${warungId}`), {
      ownerUid,
      verificationStatus,
      createdAt: Timestamp.now(),
    });
  });
}

function uploadAs(uid, path, contentType = 'image/jpeg', size = 16) {
  const storage = uid === null
    ? env.unauthenticatedContext().storage()
    : env.authenticatedContext(uid).storage();
  return uploadBytes(ref(storage, path), new Uint8Array(size), { contentType });
}

describe('Storage Rules — foto profil, galeri warkop, dan poster acara', () => {
  it('menolak unggahan foto warkop oleh non-pemilik', async () => {
    const warungId = nextId('owned');
    await seedWarung(warungId, 'alice', 'verified');
    await assertFails(uploadAs('bob', `warungPhotos/${warungId}/photo-0.jpg`));
  });

  it('mengizinkan foto galeri untuk warkop pending, tetapi menolak poster acara', async () => {
    const warungId = nextId('pending');
    await seedWarung(warungId, 'alice', 'pending');
    await assertSucceeds(uploadAs('alice', `warungPhotos/${warungId}/photo-0.jpg`));
    await assertFails(uploadAs('alice', `eventPhotos/${warungId}/${Date.now()}.jpg`));
  });

  it('menolak file yang melebihi batas 2 MiB', async () => {
    const warungId = nextId('large');
    await seedWarung(warungId, 'alice', 'verified');
    await assertFails(uploadAs('alice', `warungPhotos/${warungId}/photo-1.jpg`, 'image/jpeg', 2 * 1024 * 1024 + 1));
  });

  it('menolak MIME type selain JPEG, PNG, dan WebP', async () => {
    const warungId = nextId('mime');
    await seedWarung(warungId, 'alice', 'verified');
    await assertFails(uploadAs('alice', `warungPhotos/${warungId}/photo-2.jpg`, 'image/gif'));
  });

  it('menolak slot foto di luar photo-0 sampai photo-4', async () => {
    const warungId = nextId('slot');
    await seedWarung(warungId, 'alice', 'verified');
    await assertFails(uploadAs('alice', `warungPhotos/${warungId}/photo-5.jpg`));
  });

  it('menolak nama poster yang bukan timestamp milidetik dengan ekstensi gambar', async () => {
    const warungId = nextId('poster');
    await seedWarung(warungId, 'alice', 'verified');
    await assertFails(uploadAs('alice', `eventPhotos/${warungId}/poster-final.jpg`));
    await assertSucceeds(uploadAs('alice', `eventPhotos/${warungId}/${Date.now()}.webp`, 'image/webp'));
  });

  it('menolak MIME yang dipalsukan pada poster acara', async () => {
    const warungId = nextId('poster-mime');
    await seedWarung(warungId, 'alice', 'verified');
    await assertFails(uploadAs('alice', `eventPhotos/${warungId}/${Date.now()}.png`, 'application/octet-stream'));
  });
});
