// Platform role authorization tests. Emulator-only; never connects to live Firebase.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';

let env;
const asMember = () => env.authenticatedContext('member').firestore();
const asModerator = () => env.authenticatedContext('moderator', { platformRole: 'moderator' }).firestore();
const asSuperAdmin = () => env.authenticatedContext('owner', { platformRole: 'super_admin' }).firestore();
const asLegacyAdmin = () => env.authenticatedContext('legacy-admin', { admin: true }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sl-community-role-rules',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'warungs/pending-warung'), {
      name: 'Warkop Uji', nameNormalized: 'warkop uji', ownerUid: 'member',
      coordinates: { lat: -7, lng: 112 }, address: 'Jl. Uji No. 1, Lamongan',
      regionCode: 'lamongan-kab', facilities: [], priceRange: 'hemat',
      openingHours: {}, photos: [], verificationStatus: 'pending',
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'posts/post-target'), {
      authorId: 'member', authorName: 'Member', body: 'Postingan uji', topic: 'Ngopi Bareng',
      createdAt: Timestamp.now(), reactions: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, totalReactions: 0,
    });
    await setDoc(doc(db, 'postReports/report-1'), {
      targetPostId: 'post-target', targetAuthorId: 'member', reporterUid: 'member',
      reason: 'Spam atau promosi berulang', createdAt: Timestamp.now(),
    });
  });
});

async function approvePendingWarung(db, actorUid) {
  const batch = writeBatch(db);
  const auditRef = doc(collection(db, 'verificationAudit'));
  batch.update(doc(db, 'warungs/pending-warung'), {
    verificationStatus: 'verified', verificationAuditId: auditRef.id, updatedAt: serverTimestamp(),
  });
  batch.set(auditRef, {
    warungId: 'pending-warung', warungName: 'Warkop Uji', previousStatus: 'pending',
    newStatus: 'verified', actorUid, reason: '', createdAt: serverTimestamp(),
  });
  await batch.commit();
}

async function moderateReport(db, actorUid) {
  const batch = writeBatch(db);
  const auditRef = doc(collection(db, 'postReportAudit'));
  batch.set(doc(db, 'postReportModeration/report-1'), {
    reportId: 'report-1', status: 'Ditinjau', updatedBy: actorUid,
    updatedAt: serverTimestamp(), latestAuditId: auditRef.id,
  });
  batch.set(auditRef, {
    reportId: 'report-1', previousStatus: 'Baru', newStatus: 'Ditinjau',
    actorUid, note: '', createdAt: serverTimestamp(),
  });
  await batch.commit();
}

describe('platform role claims', () => {
  it('super_admin can verify a warung and create its atomic audit record', async () => {
    await assertSucceeds(approvePendingWarung(asSuperAdmin(), 'owner'));
  });

  it('moderator can read reports and perform audited report moderation', async () => {
    const db = asModerator();
    await assertSucceeds(getDoc(doc(db, 'postReports/report-1')));
    await assertSucceeds(moderateReport(db, 'moderator'));
  });

  it('moderator cannot approve warungs or read verification audit records', async () => {
    const db = asModerator();
    await assertFails(approvePendingWarung(db, 'moderator'));
    await assertFails(getDoc(doc(db, 'verificationAudit/any-audit')));
  });

  it('member cannot read private reports or write moderation state', async () => {
    const db = asMember();
    await assertFails(getDoc(doc(db, 'postReports/report-1')));
    await assertFails(moderateReport(db, 'member'));
  });

  it('legacy admin claim remains a super-admin compatibility path during migration', async () => {
    await assertSucceeds(approvePendingWarung(asLegacyAdmin(), 'legacy-admin'));
  });

  it('platform role audit is readable only by super_admin and never writable by clients', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'platformRoleAudit/event-1'), {
        targetUid: 'moderator', newRole: 'moderator', actorUid: 'owner', createdAt: Timestamp.now(),
      });
    });
    await assertSucceeds(getDoc(doc(asSuperAdmin(), 'platformRoleAudit/event-1')));
    await assertFails(getDoc(doc(asModerator(), 'platformRoleAudit/event-1')));
    await assertFails(setDoc(doc(asSuperAdmin(), 'platformRoleAudit/fake'), {
      targetUid: 'member', newRole: 'super_admin', actorUid: 'owner', createdAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(asSuperAdmin(), 'platformRoleAudit/event-1'), { newRole: 'member' }));
  });

  it('users cannot create or edit their own platform role documents', async () => {
    await assertFails(setDoc(doc(asMember(), 'platformRoles/member'), {
      uid: 'member', role: 'super_admin',
    }));
  });
});
