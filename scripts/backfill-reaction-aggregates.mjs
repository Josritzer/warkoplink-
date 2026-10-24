#!/usr/bin/env node
/**
 * Backfill reaction aggregates for existing SL Community Platform posts.
 *
 * Safe by default: reads and reports only. Pass --apply to write changes.
 * Uses Firebase Admin Application Default Credentials (never put service keys
 * in source control). Run only against the intended Firebase project.
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const projectArg = process.argv.find((arg) => arg.startsWith('--project='));
const expectedProject = projectArg?.slice('--project='.length);
const app = getApps()[0] || initializeApp({
  credential: applicationDefault(),
  ...(expectedProject ? { projectId: expectedProject } : {}),
});
const db = getFirestore(app);
const fields = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
const emojiField = new Map([
  ['👍', 'like'], ['❤️', 'love'], ['😂', 'haha'],
  ['😮', 'wow'], ['😢', 'sad'], ['😡', 'angry'],
]);

const posts = await db.collection('posts').get();
let changed = 0;
let unchanged = 0;

for (const post of posts.docs) {
  const current = post.data();
  const reactionsSnapshot = await post.ref.collection('likes').get();
  const reactions = Object.fromEntries(fields.map((field) => [field, 0]));

  for (const reactionDoc of reactionsSnapshot.docs) {
    const emoji = reactionDoc.data().emoji;
    // Legacy likes had no emoji field; preserve them as 👍.
    const field = emojiField.get(emoji) || (emoji == null ? 'like' : null);
    if (field) reactions[field] += 1;
  }

  const aggregate = {
    reactions,
    totalReactions: reactionsSnapshot.size,
  };
  const same = fields.every((field) => current.reactions?.[field] === reactions[field])
    && current.totalReactions === aggregate.totalReactions;

  if (same) {
    unchanged += 1;
    continue;
  }

  changed += 1;
  console.log(`${apply ? 'UPDATE' : 'DRY-RUN'} posts/${post.id}: ${aggregate.totalReactions} reactions`);

  if (apply) {
    await post.ref.update(aggregate);
  }
}

console.log(`Finished. scanned=${posts.size}, changed=${changed}, unchanged=${unchanged}, mode=${apply ? 'APPLY' : 'DRY-RUN'}`);
if (!apply) {
  console.log('No data changed. Review the counts, then rerun with --apply and --project=YOUR_FIREBASE_PROJECT_ID to write.');
}
