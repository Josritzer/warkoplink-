# Firebase token revocation — runtime decision

Status: read-only verifier now wires Firebase `accounts:lookup` after local JWT verification. CI covers mocked REST responses and handler behavior; no live Auth call, runtime secret, bucket, billing, database, or deployment change has been made.

## Decision

Do not extend `firebase-auth-check` into an upload authorization endpoint yet.

The function source now verifies a Firebase ID token's JWT signature, issuer, audience, and time claims, then calls Firebase Auth `accounts:lookup` server-side to verify UID match, disabled-account state, and the refresh-token revocation boundary. This remains a read-only identity check, not resource authorization or an upload gateway. Live Firebase behavior has not yet been tested.

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
4. An isolated import/initialization probe for `firebase-admin@13.5.0` failed in GitHub Actions because transitive Node compatibility modules attempted to enumerate/read process environment variables. Allowing one named variable merely exposed a second unrestricted environment access. The probe was removed rather than granting broad environment access. This is evidence of friction in the Deno test runtime, not definitive proof that every Admin SDK operation is impossible in Supabase Edge Runtime.
5. Firebase's official Auth REST reference documents `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=API_KEY`, accepting an ID token and returning the matching user's `localId`, `validSince` (Unix seconds as a string), and `disabled` fields.
6. Firebase Admin Node SDK source confirms the exact revocation comparison: convert `auth_time` seconds to milliseconds, convert `tokensValidAfterTime` to milliseconds, and reject only when `auth_time_ms < validSince_ms`. Equality is accepted. The SDK checks disabled status before the revocation comparison.
7. The pure revocation helper, mocked REST response validation, and handler integration are covered by Deno tests. They do not prove live Firebase behavior, API-key restrictions, or behavior during Firebase outages. This remains a source-level proof of concept, not an approved production verifier.


The response validator in `account-lookup.ts` accepts exactly one user, requires `localId` to match the already-verified JWT UID, requires `disabled === false`, and applies the strict `auth_time < validSince` revocation check. `firebase-auth-rest.ts` performs the HTTPS `accounts:lookup` request using the server-side `FIREBASE_WEB_API_KEY` environment variable and fails closed on missing configuration, HTTP errors, malformed JSON, or invalid account data. The handler now calls this lookup before returning an identity. Deno tests cover mocked HTTP responses and handler behavior; no live Firebase account lookup has been performed.

## Runtime options to evaluate

### Option A — Deno + Firebase Auth REST lookup (preferred isolated POC)

After the existing local JWT signature/issuer/audience/time validation:

1. POST the ID token to Firebase Auth REST `accounts:lookup` over HTTPS using the project's Web API key.
2. Require exactly one user result.
3. Require `localId` to equal the UID from the cryptographically verified JWT.
4. Reject if `disabled === true`; require a valid boolean value.
5. Require a valid numeric `validSince` string in Unix seconds. Reject missing or malformed values (fail closed).
6. Reject when `auth_time < validSince`. Equality is accepted, matching Firebase Admin SDK source. Do not round fractional `validSince` values.
7. Reject non-2xx responses, timeouts, unexpected response shapes, and all network/API errors (fail closed).
8. Never log or return the ID token, API key, email, account profile, or raw Auth response.

The Web API key is not a substitute for the user's token and must never be treated as authorization. Restrict it to the required Firebase API where compatible with the app's existing configuration. The request must remain server-side; do not add a new client call that exposes account lookup results.

Unit tests cover the time boundary, mocked REST responses (exactly one user, UID match, disabled status, malformed fields, HTTP errors, and network failures), and handler behavior. Still required for the full POC: a separately approved live test using dedicated non-production Firebase accounts for enabled, disabled, and revoked cases.

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
| `auth_time < validSince` | Reject |
| `auth_time === validSince` | Accept |
| `auth_time > validSince` | Accept |
| Disabled Firebase user | Reject |
| Missing/malformed `validSince` | Fail closed |
| Firebase Auth status endpoint unavailable | Fail closed |
| Client supplies another UID | Ignore client UID; use verified UID only |

Use a dedicated non-production Firebase test account. Do not revoke or disable a real user account to test this behavior.

## Next implementation sequence

1. Mocked REST response-validation and handler tests are implemented and pass in CI.
2. Review the REST request and response handling against Firebase's official contract.
3. Run a separately approved POC with a dedicated non-production test account and a server-side key configuration.
4. Keep the function read-only; do not add upload/delete operations until the live revocation-aware verifier passes the proof matrix.
5. Only after a proven verifier exists, design resource ownership checks and server-side image validation.
6. Only after all gates pass, propose a separate avatar-only upload implementation and staging test.

## Security and change-control boundaries

- Keep `firebase-auth-check` read-only.
- No Supabase bucket, table, policy, secret, or function deployment.
- No Firebase Auth, Firestore, Storage, billing, or Hosting changes.
- No production uploads or migration of existing photos.
- No changes to Bookingpijat.com or Sules.
- PR remains draft until runtime proof and integration tests are complete.

## References

- Firebase Auth REST API — `accounts:lookup`, `validSince`, and `disabled`: https://firebase.google.com/docs/reference/rest/auth
- Firebase session management and revocation: https://firebase.google.com/docs/auth/admin/manage-sessions
- Firebase Admin Node Auth API: https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.baseauth
- Firebase Admin SDK implementation: https://github.com/firebase/firebase-admin-node/blob/main/src/auth/base-auth.ts
- Supabase Edge Functions runtime: https://supabase.com/docs/guides/functions
