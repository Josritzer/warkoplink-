# WarkopLink image ownership audit

Audit target: repository `main` at `09c88d23f2cc3c536bf9c65478aa7d26494c3d2b`. This is a source-code inspection, not a live database inventory. Existing production documents may contain older or additional fields.

## Confirmed application model

### User profile
- Private profile document: `profiles/{uid}`.
- Public profile document: `publicProfiles/{uid}`.
- Both currently carry `photoURL`; public profile rules allow public reads and restrict writes to the matching Firebase UID.
- Current avatar upload uses Firebase Storage path `profilePhotos/{uid}/avatar`, then updates Firebase Auth `photoURL`, `profiles.photoURL`, and `publicProfiles.photoURL`.
- The current UI accepts JPEG, PNG, WebP and enforces 2 MiB on the client. Server-side validation is still required.

### Warkop
- Warkop document: `warungs/{warungId}`.
- Registration writes `ownerUid`, `photos: []`, `verificationStatus: 'pending'`, and timestamps.
- Firestore rules require `photos` to be a list with at most five entries.
- The profile page identifies the owner by `warung.ownerUid === user.uid`.
- The public directory only queries documents with `verificationStatus == 'verified'`.
- The current profile page renders a generic store icon; no actual photo upload/display workflow was found in the inspected component.

### Events
- Warkop events are currently represented as posts in `posts/{postId}`, not as a separate `events` collection.
- The warkop owner flow creates a post with `authorId: user.uid`, `postType: 'Acara Warkop'`, topic `Info & Acara`, and event date/time fields.
- Current post schema and Firestore rules do not include an event poster/image field.
- Therefore an event poster cannot safely be added by simply storing a URL in an arbitrary field; the post schema, rules, display components, and edit/delete behavior must be deliberately extended together.

## Ownership implications

| Media | Trusted owner check | Current storage field |
|---|---|---|
| Avatar | Firebase UID equals profile document ID | Auth `photoURL`, `profiles.photoURL`, `publicProfiles.photoURL` |
| Warkop photos | Firebase UID equals `warungs/{id}.ownerUid`; verify current status/permissions | `warungs/{id}.photos[]` |
| Event poster | Firebase UID equals the event post's `authorId`; if organizer delegation is added, verify that separately | No poster field currently exists |

A client-supplied UID, object path, URL, warkop ID, or post ID is only a lookup hint. The server must load the authoritative record and verify ownership/role before upload, replacement, or deletion.

## Important compatibility rules

1. Keep the existing Firebase avatar path and URLs working during transition.
2. Do not rewrite all profile URLs as part of the first rollout.
3. For warkop photos, preserve the current `photos` list shape until a separately reviewed migration or compatibility layer is designed.
4. Do not add event poster fields until Firestore validation rules and all event/post rendering and editing paths are updated with tests.
5. Never trust a public profile document as the authority for account status or privileged roles.
6. Do not allow a user to upload to a verified warkop solely because they know its document ID; compare the authenticated UID to the authoritative owner/authorized-manager record.

## Next implementation boundary

The safest first implementation slice is **avatar-only**, because its ownership key and current UI/storage path are already explicit. Even avatar writes must remain disabled until the revocation-aware Firebase verification and server-side image validation gates in `STORAGE_GATEWAY_PLAN.md` are met.

Warkop gallery and event poster should be separate later slices. Do not create a bucket or change the live app as part of this audit.
