# Firebase token revocation — runtime decision

Status: evidence and implementation gate only. No runtime, secret, bucket, billing, database, or deployment changes.

## Decision

Do not extend `firebase-auth-check` into an upload authorization endpoint yet.

The current function verifies a Firebase ID token's JWT signature, issuer, audience, and time claims. It does not verify whether the Firebase user is disabled or whether the refresh-token session was revoked.

For any write-capable media gateway, the required identity contract is:

- Verify the ID token cryptographically.
- Check the Firebase user record for disabled status.
- Check the refresh-token revocation boundary.
- Derive UID only from the verified token and confirm it matches the Auth response.
- Fail closed if Firebase Auth cannot be reached or the status check errors.

## Verified platform facts

1. Firebase documents Admin SDK `verifyIdToken(idToken, true)` as checking disabled-user status and ID-token revocation; the revocation check requires an additional Firebase Auth request.
2. Supabase Edge Functions run on a Deno-compatible TypeScript runtime.
3. The repository's `firebase-admin` development dependency does not establish that the Admin SDK is supported or operational in Supabase Edge Runtime.
4. The Deno type-check and JWKS-only unit tests pass.
5. An isolated import/initialization probe for `firebase-admin@13.5.0` failed in GitHub Actions because transitive Node compatibility modules attempted to enumerate/read process environment variables. Allowing one named variable merely exposed a second unrestricted environment access. The probe was removed rather than granting broad environment access. This is evidence of friction in the Deno test runtime, not definitive proof that every Admin SDK operation is impossible in Supabase Edge Runtime.
6. Firebase's official Auth REST reference documents `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=API_KEY`, accepting an ID token and returning the matching user's `localId`, `validSince` (seconds), and `disabled` fields. The API key is the Firebase Web API key; this is project configuration, not an Admin private key.
7. The REST documentation establishes that these fields are returned, but this repository has not yet tested the exact revocation-boundary comparison, disabled-account behavior, API-key restrictions, or behavior during Firebase outages. Therefore this is a promising proof-of-concept path, not an approved production verifier.

## Runtime options to evaluate

### Option A — Deno + Firebase Auth REST lookup (new preferred proof-of-concept)

After the existing local JWT signature/issuer/audience/time validation:

1. POST the ID token to Firebase Auth REST `accounts:lookup` over HTTPS using the project's Web API key.
2. Require exactly one user result.
3. Require `localId` to equal the UID from the cryptographically verified JWT.
4. Reject if `disabled === true`.
5. Parse `validSince` as a finite integer number of seconds and compare it with the verified JWT's `auth_time` using the Firebase-documented revocation boundary semantics. Do not guess the comparison operator; confirm it against Firebase's Admin SDK behavior and a dedicated test account before implementation.
6. Reject malformed/missing fields, non-2xx responses, timeouts, unexpected response shape, and all network/API errors (fail closed).
7. Never log or return the ID token, API key, email, account profile, or raw Auth response.

The Web API key is not a substitute for the user's token and must never be treated as authorization. Restrict it to the required Firebase API where compatible with the app's existing configuration. The request must remain server-side; do not add a new client call that exposes account lookup results.

Required POC tests: enabled valid account accepted; disabled account rejected; token issued before the revocation boundary rejected; token issued after the boundary accepted; UID mismatch rejected; malformed `validSince` rejected; Firebase 4xx/5xx/network timeout rejected. Use a dedicated non-production Firebase test account only. Do not revoke or disable a real user's account.

### Option B — Supabase Edge Function with Firebase Admin SDK

Keep experimental until a minimal isolated proof demonstrates in the actual Supabase Edge Runtime:

- Firebase Admin SDK initializes using server-only credentials.
- `verifyIdToken(token, true)` succeeds for a valid test account.
- A revoked token is rejected.
- A disabled account is rejected.
- Network failures and credential failures fail closed.
- No private key, ID token, or sensitive claims are logged or returned.

Do not assume Node package compatibility from Deno npm import support alone. Do not grant broad environment access just to make a CI import probe pass. If this proof fails or relies on unsupported shims, stop this path.

### Option C — trusted Node.js runtime

Use a dedicated server-side Node.js runtime with the official Firebase Admin SDK and `verifyIdToken(token, true)`. Keep credentials in that runtime's secret manager, never in the browser or a public repository.

This is the clearest documented route. It introduces a separately hosted backend and must not be selected until its free-tier limits, availability, operational burden, and any billing requirements are verified and approved.

### Option D — retain Firebase Storage

Re-evaluate only if an existing Firebase Storage bucket can be used within an approved billing plan. Do not enable Blaze or change billing to make this option work without explicit approval. Existing Storage Rules are useful for owner-bound direct uploads, but current Firebase Storage access under Spark must not be assumed available.

## Required proof matrix

| Case | Expected result |
|---|---|
| Valid token, enabled account | Accept identity |
| Expired token | Reject |
| Wrong Firebase project/audience | Reject |
| Modified signature | Reject |
| Token issued before revocation boundary | Reject |
| Token issued after revocation boundary | Accept |
| Disabled Firebase user | Reject |
| Firebase Auth status endpoint unavailable | Fail closed |
| Malformed or missing `validSince` | Fail closed |
| Client supplies another UID | Ignore client UID; use verified UID only |

Use a dedicated non-production Firebase test account. Do not revoke or disable a real user account to test this behavior.

## Next implementation sequence

1. Build a pure, mocked unit-testable REST lookup verifier design; do not add credentials or make live Auth calls in CI.
2. Confirm the exact `auth_time` vs `validSince` boundary against Firebase documentation/Admin SDK semantics before implementing it.
3. If semantics are confirmed, run a separately approved POC with a dedicated non-production test account and a server-side key configuration.
4. Keep the current JWKS function read-only until the revocation-aware verifier passes the proof matrix.
5. Only after a proven verifier exists, design resource ownership checks and image validation.
6. Only after all gates pass, propose a separate avatar-only upload implementation and staging test.

## Security and change-control boundaries

- Keep `firebase-auth-check` read-only.
- No Supabase bucket, table, policy, secret, or function deployment.
- No Firebase Auth, Firestore, Storage, billing, or Hosting changes.
- No production uploads or migration of existing photos.
- No changes to Bookingpijat.com or Sules.
- PR remains draft until runtime proof and integration tests are complete.

## References

- Firebase Auth REST API — accounts:lookup and returned `validSince`/`disabled` fields: https://firebase.google.com/docs/reference/rest/auth
- Firebase session management and revocation: https://firebase.google.com/docs/auth/admin/manage-sessions
- Firebase Admin Node Auth API: https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.baseauth
- Supabase Edge Functions runtime: https://supabase.com/docs/guides/functions
