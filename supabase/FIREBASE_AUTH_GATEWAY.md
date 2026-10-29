# Firebase Auth gateway for Supabase

## Purpose

Keep the existing Firebase Authentication accounts. This first function is a
small identity-verification probe only: it verifies a Firebase ID token and
returns the Firebase UID. It does not read or write application data, create
tables, create buckets, or expose a Supabase service-role key.

Firebase project: `sl-community-platform`  
Supabase project: `klikvxuronunonymmiqv`

## Verification performed

- Google Secure Token public JWKS signature verification.
- RS256 algorithm allowlist.
- Exact Firebase issuer: `https://securetoken.google.com/sl-community-platform`.
- Exact audience: `sl-community-platform`.
- JWT expiry and not-before checks via jose.
- Non-empty Firebase subject (UID), with a length bound.
- Exact browser-origin allowlist and no wildcard CORS.
- No token, email, or raw claims are returned or logged.

This JWKS verification does not check Firebase refresh-token revocation or
account-disabled status. Do not treat it as a complete authorization policy
for sensitive actions. Add a revocation-aware server check before using this
gateway for high-risk operations.

## Local verification

Run the Deno tests from the repository root:

```sh
deno test supabase/functions/firebase-auth-check/index_test.ts
```

Run the function locally after linking the intended Supabase project:

```sh
supabase functions serve firebase-auth-check --no-verify-jwt
```

Call it with a real Firebase ID token from an authenticated test account:

```sh
curl -i http://127.0.0.1:54321/functions/v1/firebase-auth-check \
  -X POST \
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
  -H "Content-Type: application/json"
```

Expected success shape: `{"authenticated":true,"uid":"<firebase-uid>"}`.
Missing, malformed, expired, wrong-project, or invalid-signature tokens must
receive HTTP 401. Disallowed browser origins receive HTTP 403.

## Deployment gate

Do not deploy this function until:
1. The local Deno tests pass.
2. A real token from a dedicated test account succeeds.
3. Expired, modified, and wrong-project tokens fail.
4. CORS behavior is checked from the actual WarkopLink origin.
5. The owner explicitly approves deployment.

The function is configured with `verify_jwt = false` because Firebase ID
tokens are not Supabase JWTs. This is safe only because this endpoint verifies
Firebase tokens itself before returning an identity. Keep the endpoint
read-only; do not add service-role database operations to this probe.

No Firebase billing, Firebase configuration, production hosting, Supabase
database schema, storage bucket, or user data is changed by this source-only
change.
