# Supabase Storage gateway — implementation plan and status

## Live preparation status — 30 October 2026

- Supabase project: `klikvxuronunonymmiqv` (WarkopLink only).
- `warkoplink-quarantine`: private bucket; maximum 2 MiB; JPEG/PNG/WebP.
- `warkoplink-media`: public-read bucket for approved public images; maximum 2 MiB; JPEG/PNG/WebP.
- PR #118 contains the draft gateway and frontend integration. It is not merged and the Edge Function is not deployed.
- Identity uses the existing server-side `FIREBASE_WEB_API_KEY`; Supabase admin operations use platform-injected server-only secret keys. No key value is committed to source.
- Existing Firebase Storage files and URLs are not migrated or deleted. New uploads remain unavailable until the PR is approved, merged, and deployed.

## Scope and non-goals

This plan prepares image storage without changing the live WarkopLink app. Firebase Authentication remains the identity provider. Firebase Auth, Firestore profiles/posts/chat, existing Firebase Storage objects, and current public hosting remain untouched.

The two initial buckets have now been created. This document does not deploy the gateway, migrate files, or enable browser uploads until PR #118 passes CI and receives release approval.

## Proposed first release

Support only:
- Profile avatar: one image per user.
- Warkop gallery: up to five images per registered warkop.
- Event poster: one poster, with an optional supporting image if product requirements confirm it.

Allowed formats: JPEG, PNG, WebP. Maximum upload size: 2 MiB per image. No SVG, HTML, animated formats, or video. Images should be decoded and re-encoded server-side (or by a trusted image-processing service) to an approved raster format, with EXIF metadata stripped.

Firestore should retain only the resulting public URL/object path and minimal image metadata. Do not store base64/data URLs in Firestore.

## Storage layout

Use one bucket initially, with logical prefixes:
- `profiles/{firebaseUid}/{objectId}.webp`
- `warkops/{warkopId}/{objectId}.webp`
- `events/{eventId}/{objectId}.webp`

Object IDs must be server-generated UUIDs; never accept a client-chosen object path as authority.

A warkop or event upload must verify the caller's actual role/ownership against trusted application data. Matching a UID embedded in a path is not sufficient authorization.

## Access model

- Public read is acceptable only for images intentionally published as public profile, warkop, or event content. Anyone with the public URL can view them.
- Browser clients must not receive the Supabase service-role key.
- Do not enable direct browser writes using the current token-probe function.
- Upload, replace, and delete must go through a server-side gateway that validates the Firebase identity and authorizes the specific resource action.
- Keep private or sensitive media out of this public bucket; use a separate private design and signed access if that requirement appears.

## Mandatory security gates before any write endpoint

The `firebase-auth-check` version 2 is deployed and ACTIVE in the WarkopLink Supabase project. It verifies Firebase JWT signature, issuer, audience, algorithm, and time claims, then performs server-side Firebase Auth `accounts:lookup` to check UID match, disabled-account state, and token revocation. It remains a read-only identity verifier, not a resource-ownership authorization layer. CI tests use mocked Firebase responses; live behavior against disabled/revoked accounts and API-key restrictions remain unverified.

Before using Firebase tokens to authorize Storage mutations:
1. Reuse the deployed revocation-aware identity verifier only after its live integration behavior and API-key restrictions have been verified safely. Do not treat its returned UID as proof of resource ownership.
2. Implement a separate authorization step that reads authoritative Firestore records and verifies profile ownership, `warungs/{id}.ownerUid`, and event ownership/organizer roles. Never accept client-supplied UID/role claims or object paths as authority.
3. Validate request size before buffering; enforce 2 MiB server-side.
4. Allowlist MIME types and inspect file signatures/decoded content; do not trust the request Content-Type or filename.
5. Re-encode images, strip EXIF, generate server-controlled object names, and reject malformed/decompression-bomb inputs.
6. Add per-user/resource rate limits and quotas, safe replacement semantics, and cleanup for abandoned uploads.
7. Ensure CORS is restricted to the actual production origin plus explicitly needed development origins.
8. Add tests for unauthorized users, cross-resource access, disabled/revoked accounts, oversized files, MIME spoofing, malformed images, and delete/replace ownership.

If any gate is missing, keep writes disabled.

## Migration and compatibility

- Existing Firebase Storage image URLs remain valid and continue rendering.
- Do not bulk-copy or delete existing files automatically.
- New UI should tolerate both legacy Firebase URLs and new Supabase public URLs during a separately approved transition.
- Migrate only after backup, inventory, ownership mapping, and an explicit owner approval.

## Rollout sequence

1. Review and approve this design.
2. Implement revocation-aware identity and resource authorization.
3. Implement a narrow upload/delete gateway with the validation above.
4. Run automated tests and a real test-account integration test.
5. Create the bucket and apply the reviewed access configuration.
6. Enable one image category behind a feature flag and verify it in staging.
7. Obtain explicit approval before production rollout or migration.

## Cost and production guardrails

Use the existing Supabase Free project only while its current quotas are sufficient. Do not enable Firebase Blaze, paid Supabase features, billing, or other paid services without explicit approval. Monitor storage size, bandwidth, and function invocations before expanding usage.

No production change is authorized by this plan.
