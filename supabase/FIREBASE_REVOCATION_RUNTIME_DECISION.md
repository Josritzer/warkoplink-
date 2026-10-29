# Firebase token revocation — runtime decision

Status: evidence and implementation gate only. No runtime, secret, bucket, billing, database, or deployment changes.

## Decision

Do not extend `firebase-auth-check` into an upload authorization endpoint.

The current function verifies a Firebase ID token's JWT signature, issuer, audience, and time claims. It does not verify whether the Firebase user is disabled or whether the refresh-token session was revoked.

For any write-capable media gateway, the required identity contract is:

- Verify the ID token cryptographically.
- Check the Firebase user record for disabled status.
- Check refresh-token revocation.
- Derive UID only from the verified token.
- Fail closed if Firebase Auth cannot be reached or the status check errors.

## Verified platform facts

1. Firebase documents `verifyIdToken(idToken, true)` as the Admin SDK method that checks both disabled-user status and ID-token revocation. The revocation check requires an additional request to Firebase Auth.
2. Supabase Edge Functions run on a Deno-compatible TypeScript runtime.
3. The current repository includes `firebase-admin` as a development dependency, but that does not establish that the Admin SDK is supported or operational in Supabase Edge Runtime.
4. The current CI proves Deno type-checking and unit tests for the JWKS-only probe. It does not prove Firebase Admin SDK compatibility, real token revocation behavior, or disabled-account handling.

## Runtime options to evaluate

### Option A — Supabase Edge Function with Firebase Admin SDK

Keep this option experimental until a minimal isolated proof demonstrates all of the following in the actual Supabase Edge Runtime:

- Firebase Admin SDK initializes using server-only credentials.
- `verifyIdToken(token, true)` succeeds for a valid test account.
- A revoked token is rejected.
- A disabled account is rejected.
- Network failures and credential failures fail closed.
- No private key, ID token, or sensitive claims are logged or returned.

Do not assume Node package compatibility from Deno npm import support alone. If this proof fails or relies on unsupported shims, stop this path.

### Option B — trusted Node.js runtime

Use a dedicated server-side Node.js runtime with the official Firebase Admin SDK and `verifyIdToken(token, true)`. Keep credentials in that runtime's secret manager, never in the browser or a public repository.

This is the clearest documented route for revocation-aware verification. It introduces a separately hosted backend and must not be selected until its free-tier limits, availability, operational burden, and any billing requirements are verified and approved.

### Option C — retain Firebase Storage

Re-evaluate only if an existing Firebase Storage bucket can be used within an approved billing plan. Do not enable Blaze or change billing to make this option work without explicit approval. Existing Storage Rules are useful for owner-bound direct uploads, but current Firebase Storage access under Spark must not be assumed available.

## Required proof matrix

| Case | Expected result |
|---|---|
| Valid token, enabled account | Accept identity |
| Expired token | Reject |
| Wrong Firebase project/audience | Reject |
| Modified signature | Reject |
| Revoked refresh-token session | Reject |
| Disabled Firebase user | Reject |
| Firebase Auth status endpoint unavailable | Fail closed |
| Client supplies another UID | Ignore client UID; use verified UID only |

Use a dedicated non-production Firebase test account. Do not revoke or disable a real user account to test this behavior.

## Next implementation sequence

1. Create an isolated compatibility test branch or test harness; do not alter the current read-only probe.
2. Test Option A in a local Supabase Edge Runtime first, using temporary test credentials that are never committed.
3. If Option A is unsupported or fails any matrix case, stop and document the failure rather than adding workarounds.
4. Evaluate Option B's runtime/free-tier and operational cost before implementation.
5. Only after a proven verifier exists, design resource ownership checks and image validation.
6. Only after all gates pass, propose a separate avatar-only upload implementation and staging test.

## Security and change-control boundaries

- Keep `firebase-auth-check` read-only.
- No Supabase bucket, table, policy, secret, or function deployment.
- No Firebase Auth, Firestore, Storage, billing, or Hosting changes.
- No production uploads or migration of existing photos.
- No changes to Bookingpijat.com or Sules.
- PR remains draft until the runtime proof and integration tests are complete.

## References

- Firebase session management and revocation: https://firebase.google.com/docs/auth/admin/manage-sessions
- Firebase Admin Node Auth API: https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.baseauth
- Supabase Edge Functions runtime: https://supabase.com/docs/guides/functions
