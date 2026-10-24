import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-sl-community-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') }
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

async function seedPost(id, authorId) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'posts', id), {
      authorId,
      authorName: 'Anggota',
      body: 'Status uji hapus',
      topic: 'Obrolan Umum',
      createdAt: new Date()
    });
  });
}

describe('Firestore Rules: penghapusan status', () => {
  it('mengizinkan pemilik menghapus status sendiri', async () => {
    await seedPost('owned-post', 'author-1');
    const db = testEnv.authenticatedContext('author-1').firestore();
    await expect(assertSucceeds(deleteDoc(doc(db, 'posts', 'owned-post')))).resolves.toBeUndefined();
  });

  it('menolak pengguna lain menghapus status orang lain', async () => {
    await seedPost('other-post', 'author-1');
    const db = testEnv.authenticatedContext('reader-2').firestore();
    await assertFails(deleteDoc(doc(db, 'posts', 'other-post')));
  });
});
