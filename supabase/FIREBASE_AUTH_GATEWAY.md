# Firebase Auth gateway for Supabase

## Purpose

Keep the existing Firebase Authentication accounts. This function is a read-only identity verifier. The PR branch verifies the Firebase ID token signature and claims, then performs a server-side Firebase Auth `accounts:lookup` to confirm the UID, enabled-account status, and token revocation boundary. It does not authorize resource ownership or read/write application data, upload/delete media, create tables, create buckets, or expose a Supabase service-role key.

Firebase project: `sl-community-platform`  
Supabase project: `klikvxuronunonymmiqv`

## Deployment status — important distinction

The Supabase project previously received a JWT-only `firebase-auth-check` deployment on `main`. That deployed version verifies Firebase JWT signature and claims but does **not** perform the live Firebase account-status/revocation lookup described in this PR.

The revocation-aware implementation documented below exists on branch `feat/firebase-revocation-aware-gateway` in PR #111. **That PR-branch source has not been deployed.** Do not infer that the deployed main version has revocation-aware behavior.

## Verification implemented on the PR branch

- Google Secure Token public JWKS signature verification.
- RS256 algorithm allowlist.
- Exact Firebase issuer: `https://securetoken.google.com/sl-community-platform`.
- Exact audience: `sl-community-platform`.
- JWT expiry and not-before checks via jose.
- Non-empty Firebase subject (UID), with a length bound.
- Server-side `accounts:lookup` requires exactly one matching Firebase UID, `disabled === false`, and a valid `validSince` boundary; missing/malformed status and network/API failures fail closed.
- `FIREBASE_WEB_API_KEY` is read only from the Edge Function environment. The key identifies the Firebase project; the Firebase ID token remains the identity proof.
- Exact browser-origin allowlist and no wildcard CORS.
- No token, email, or raw claims are returned or logged.

The account lookup applies the Firebase revocation boundary: reject when `auth_time < validSince`; equality is accepted. The API-key restriction configuration has **not yet been independently verified**.

## Local verification

The Deno tests include mocked `accounts:lookup` responses and handler-level tests. They do not prove a live Firebase account lookup, actual API-key restrictions, or a deployed revocation-aware Supabase function.

Run the Deno tests from the repository root:

```sh
deno test supabase/functions/firebase-auth-check/index_test.ts
```

Run the function locally after linking the intended Supabase project:

```sh
supabase functions serve firebase-auth-check --no-verify-jwt
```

Call it with a real Firebase ID token from an authenticated dedicated non-production test account:

```sh
curl -i http://127.0.0.1:54321/functions/v1/firebase-auth-check \\
  -X POST \\
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \\
  -H "Content-Type: application/json"
```

Expected success shape: `{"authenticated":true,"uid":"<firebase-uid>"}`.
Missing, malformed, expired, wrong-project, or invalid-signature tokens must
receive HTTP 401. Disallowed browser origins receive HTTP 403.

## Deployment gate

Do not deploy the PR-branch implementation until:
1. The local Deno tests pass.
2. `FIREBASE_WEB_API_KEY` is configured server-side and its applicable API restrictions are verified.
3. A real token from a dedicated non-production test account succeeds against Firebase `accounts:lookup`.
4. Expired, modified, wrong-project, revoked, and disabled-account cases fail using dedicated non-production test accounts.
5. CORS behavior is checked from the actual WarkopLink origin.
6. The owner explicitly approves deployment.

The function is configured with `verify_jwt = false` because Firebase ID tokens are not Supabase JWTs. This is safe only for a deployed version that verifies Firebase tokens itself, including the server-side account-status lookup, before returning an identity. Keep the endpoint read-only and do not add upload/delete or service-role database operations to it.

## Change boundaries

No Firebase billing, Firebase Auth configuration, production hosting, Supabase database schema, storage bucket, or user data is changed by this source-only PR. The PR remains Draft until the live proof and deployment gates above are satisfied.

No changes to Bookingpijat.com or Sules are in scope.
