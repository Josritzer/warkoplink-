import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-sl-community-post-delete-rules',
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

async function markPostDeleting(db, id) {
  await assertSucceeds(updateDoc(doc(db, 'posts', id), { deleting: true }));
}

describe('Firestore Rules: penghapusan status', () => {
  it('menolak pemilik menghapus status sebelum menandainya', async () => {
    await seedPost('direct-delete-post', 'author-1');
    const db = testEnv.authenticatedContext('author-1').firestore();
    await assertFails(deleteDoc(doc(db, 'posts', 'direct-delete-post')));
  });

  it('mengizinkan pemilik menandai status untuk dihapus', async () => {
    await seedPost('mark-delete-post', 'author-1');
    const db = testEnv.authenticatedContext('author-1').firestore();
    await markPostDeleting(db, 'mark-delete-post');
  });

  it('mengizinkan pemilik menghapus reaksi setelah status ditandai', async () => {
    await seedPost('delete-like-post', 'author-1');
    const db = testEnv.authenticatedContext('author-1').firestore();
    await markPostDeleting(db, 'delete-like-post');
    const markedPost = await getDoc(doc(db, 'posts', 'delete-like-post'));
    if (markedPost.data()?.deleting !== true) throw new Error('Post deletion marker was not persisted as true');
    if (markedPost.data()?.authorId !== 'author-1') throw new Error('Post owner does not match the authenticated owner');
    await assertSucceeds(deleteDoc(doc(db, 'posts', 'delete-like-post', 'likes', 'reader-2')));
  });

  it('mengizinkan pemilik menghapus balasan setelah status ditandai', async () => {
    await seedPost('delete-reply-post', 'author-1');
    const db = testEnv.authenticatedContext('author-1').firestore();
    await markPostDeleting(db, 'delete-reply-post');
    await assertSucceeds(deleteDoc(doc(db, 'posts', 'delete-reply-post', 'replies', 'reply-1')));
  });

  it('mengizinkan pemilik menghapus status setelah anak-anaknya dibersihkan', async () => {
    await seedPost('finish-delete-post', 'author-1');
    const db = testEnv.authenticatedContext('author-1').firestore();
    await markPostDeleting(db, 'finish-delete-post');
    await assertSucceeds(deleteDoc(doc(db, 'posts', 'finish-delete-post', 'likes', 'reader-2')));
    await assertSucceeds(deleteDoc(doc(db, 'posts', 'finish-delete-post', 'replies', 'reply-1')));
    await assertSucceeds(deleteDoc(doc(db, 'posts', 'finish-delete-post')));
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
