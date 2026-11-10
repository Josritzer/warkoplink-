// Menu Spesial security contract. Emulator-only; never connects to live Firebase.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

const OWNER_UID = 'OYgUG5eMWjfmHJ0VLaSXr34H7Dv2';
let env;
const asAnon = () => env.unauthenticatedContext().firestore();
const asUser = (uid = 'owner') => env.authenticatedContext(uid).firestore();
const asAdmin = () => env.authenticatedContext(OWNER_UID, { platformRole: 'super_admin' }).firestore();
const warung = (ownerUid = 'owner', verificationStatus = 'pending') => ({
  name: 'Warkop Uji', nameNormalized: 'warkop uji', ownerUid,
  coordinates: { lat: -7, lng: 112 }, address: 'Jl. Uji No. 1, Lamongan',
  regionCode: 'lamongan-kab', facilities: [], priceRange: 'hemat', openingHours: {}, photos: [],
  verificationStatus, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
});
const menu = (overrides = {}) => ({
  schemaVersion: 1, warungId: 'warung-1', ownerUid: 'owner', name: 'Kopi Susu',
  nameNormalized: 'kopi susu', description: 'Kopi susu gula aren', categoryId: 'coffee', tags: ['signature'],
  priceType: 'fixed', priceAmount: 18000, currency: 'IDR', photoUrl: null,
  status: 'published', availability: 'available', isPublic: false, source: 'native', sortOrder: 0,
  searchTokens: ['kopi', 'susu'], regionCode: null, provinceCode: null, regencyCode: null,
  districtCode: null, villageCode: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  ...overrides,
});
async function seedMenu(id = 'menu-1', overrides = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'warungs/warung-1'), warung('owner', overrides.parentStatus || 'pending'));
    await setDoc(doc(db, `warungMenuItems/${id}`), menu(overrides.menu || {}));
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sl-menu-rules',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe('warungMenuItems access and ownership', () => {
  it('owner may create a valid private menu only for their own parent warung', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'warungs/warung-1'), warung('owner', 'pending'));
    });
    await assertSucceeds(setDoc(doc(asUser(), 'warungMenuItems/new-menu'), menu()));
    await assertFails(setDoc(doc(asUser(), 'warungMenuItems/public-at-create'), menu({ isPublic: true })));
    await assertFails(setDoc(doc(asUser('intruder'), 'warungMenuItems/other-owner'), menu()));
  });

  it('owner cannot edit another owner menu or change immutable ownership fields', async () => {
    await seedMenu();
    await assertFails(updateDoc(doc(asUser('intruder'), 'warungMenuItems/menu-1'), { name: 'Nama baru', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser(), 'warungMenuItems/menu-1'), { ownerUid: 'intruder', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser(), 'warungMenuItems/menu-1'), { warungId: 'other-warung', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser(), 'warungMenuItems/menu-1'), { source: 'legacy-specialties', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser(), 'warungMenuItems/menu-1'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it('owner can publish publicly only when parent is verified and menu status is published', async () => {
    await seedMenu('pending-menu', { parentStatus: 'pending' });
    await assertFails(updateDoc(doc(asUser(), 'warungMenuItems/pending-menu'), { isPublic: true, updatedAt: serverTimestamp() }));
    await seedMenu('verified-menu', { parentStatus: 'verified' });
    await assertSucceeds(updateDoc(doc(asUser(), 'warungMenuItems/verified-menu'), { isPublic: true, updatedAt: serverTimestamp() }));
    await seedMenu('draft-menu', { parentStatus: 'verified', menu: { status: 'draft' } });
    await assertFails(updateDoc(doc(asUser(), 'warungMenuItems/draft-menu'), { isPublic: true, updatedAt: serverTimestamp() }));
    await seedMenu('suspended-menu', { parentStatus: 'suspended' });
    await assertFails(updateDoc(doc(asUser(), 'warungMenuItems/suspended-menu'), { isPublic: true, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(asUser(), 'warungMenuItems/suspended-menu'), { isPublic: false, updatedAt: serverTimestamp() }));
  });

  it('public visitors can read public items only; unfiltered public queries are denied', async () => {
    await seedMenu('private-menu');
    await seedMenu('public-menu', { menu: { isPublic: true } });
    await assertFails(getDoc(doc(asAnon(), 'warungMenuItems/private-menu')));
    await assertSucceeds(getDoc(doc(asAnon(), 'warungMenuItems/public-menu')));
    await assertFails(getDocs(collection(asAnon(), 'warungMenuItems')));
    await assertSucceeds(getDocs(query(collection(asAnon(), 'warungMenuItems'), where('isPublic', '==', true))));
  });

  it('admin can batch-disable public visibility on 20 menu documents without parent lookups', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'warungs/warung-1'), warung('owner', 'verified'));
      for (let i = 0; i < 20; i++) await setDoc(doc(db, `warungMenuItems/batch-${i}`), menu({ isPublic: true }));
    });
    const db = asAdmin();
    const batch = writeBatch(db);
    for (let i = 0; i < 20; i++) batch.update(doc(db, `warungMenuItems/batch-${i}`), { isPublic: false, updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
    await assertFails(deleteDoc(doc(db, 'warungMenuItems/batch-0')));
  });


  it('allows only a valid UUID for a quarantined menu photo reference', async () => {
    await seedMenu();
    const ref = doc(asUser(), 'warungMenuItems/menu-1');
    await assertSucceeds(updateDoc(ref, { pendingPhotoUploadId: '123e4567-e89b-12d3-a456-426614174000', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { pendingPhotoUploadId: 'not-a-uuid', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { pendingPhotoUploadId: null, updatedAt: serverTimestamp() }));
  });

  it('rejects arbitrary photo URLs, negative prices, and one-character names', async () => {
    await seedMenu();
    const ref = doc(asUser(), 'warungMenuItems/menu-1');
    await assertFails(updateDoc(ref, { photoUrl: 'https://example.com/anything.webp', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { priceAmount: -1, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { name: 'A', updatedAt: serverTimestamp() }));
  });
});
