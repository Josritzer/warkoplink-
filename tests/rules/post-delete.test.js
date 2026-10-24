import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

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
    await setDoc(doc(context.firestore(), 'posts', id, 'likes', 'reader-2'), {
      uid: 'reader-2', emoji: '❤️', createdAt: new Date()
    });
    await setDoc(doc(context.firestore(), 'posts', id, 'replies', 'reply-1'), {
      authorId: 'reader-2', authorName: 'Pembaca', body: 'Balasan uji', createdAt: new Date()
    });
  });
}

describe('Firestore Rules: penghapusan status', () => {
  it('mewajibkan pemilik menandai status sebelum menghapusnya', async () => {
    await seedPost('owned-post', 'author-1');
    const db = testEnv.authenticatedContext('author-1').firestore();
    await assertFails(deleteDoc(doc(db, 'posts', 'owned-post')));
    await assertSucceeds(updateDoc(doc(db, 'posts', 'owned-post'), { deleting: true }));
    await assertSucceeds(deleteDoc(doc(db, 'posts', 'owned-post', 'likes', 'reader-2')));
    await assertSucceeds(deleteDoc(doc(db, 'posts', 'owned-post', 'replies', 'reply-1')));
    await assertSucceeds(deleteDoc(doc(db, 'posts', 'owned-post')));
  });

  it('menolak pengguna lain menandai atau menghapus status orang lain', async () => {
    await seedPost('other-post', 'author-1');
    const db = testEnv.authenticatedContext('reader-2').firestore();
    await assertFails(updateDoc(doc(db, 'posts', 'other-post'), { deleting: true }));
    await assertFails(deleteDoc(doc(db, 'posts', 'other-post')));
  });

  it('menolak balasan baru setelah proses penghapusan dimulai', async () => {
    await seedPost('closing-post', 'author-1');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'posts', 'closing-post'), { deleting: true });
    });
    const db = testEnv.authenticatedContext('reader-3').firestore();
    await assertFails(setDoc(doc(db, 'posts', 'closing-post', 'replies', 'new-reply'), {
      authorId: 'reader-3', authorName: 'Pembaca 3', body: 'Balasan baru', createdAt: new Date()
    }));
  });
});
