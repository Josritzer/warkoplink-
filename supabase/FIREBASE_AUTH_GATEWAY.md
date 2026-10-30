# Firebase Auth gateway for Supabase

## Purpose

Keep the existing Firebase Authentication accounts. This function is a read-only identity verifier. The PR branch verifies the Firebase ID token signature and claims, then performs a server-side Firebase Auth `accounts:lookup` to confirm the UID, enabled-account status, and token revocation boundary. It does not authorize resource ownership or read/write application data, upload/delete media, create tables, create buckets, or expose a Supabase service-role key.

Firebase project: `sl-community-platform`  
Supabase project: `klikvxuronunonymmiqv`

## Deployment status — important distinction

The revocation-aware implementation from PR #111 was merged into `main` and deployed successfully on 30 October 2026. Supabase reports `firebase-auth-check` as ACTIVE, version 2, with `verify_jwt = false`. The active version performs Firebase `accounts:lookup` after local JWT verification. This confirms deployment, not live integration behavior against disabled or revoked accounts.

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

The Deno tests include mocked `accounts:lookup` responses and handler-level tests. They do not prove live behavior against disabled/revoked Firebase accounts or actual API-key restrictions. Deployment itself is confirmed separately by Supabase reporting ACTIVE version 2.

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

## Post-deployment verification still required

1. Verify the applicable restrictions on `FIREBASE_WEB_API_KEY`; its value must remain server-side and must never be exposed in logs or client code.
2. Exercise a real valid Firebase ID token against the deployed endpoint from a controlled existing test identity, if available.
3. Verify expired, modified, wrong-project, revoked, and disabled-account behavior without creating or disabling real WarkopLink users. If no safe test identity exists, keep those cases explicitly unverified rather than altering production accounts.
4. Check CORS from the actual WarkopLink origin.
5. Record latency and failure behavior for the Firebase `accounts:lookup` dependency.

The function is configured with `verify_jwt = false` because Firebase ID tokens are not Supabase JWTs. It remains read-only: do not add upload/delete or service-role database operations to it. It is not an upload authorization policy because it does not verify resource ownership.

## Current production state and boundaries

Deployment of version 2 is confirmed. No bucket, application table, media upload endpoint, Firebase billing upgrade, Firestore migration, or user-data change was performed by PR #111. The PR is merged; live account integration checks remain outstanding.

No changes to Bookingpijat.com or Sules are in scope.
