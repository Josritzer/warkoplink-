# Firebase Auth gateway for Supabase

## Purpose

Keep the existing Firebase Authentication accounts. This function is a read-only identity verifier. It verifies the Firebase ID token signature and claims, then performs a server-side Firebase Auth `accounts:lookup` to confirm the UID, enabled-account status, and token revocation boundary. It does not authorize resource ownership or read/write application data, upload/delete media, create tables, create buckets, or expose a Supabase service-role key.

Firebase project: `sl-community-platform`  
Supabase project: `klikvxuronunonymmiqv`

## Verification performed

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

This JWKS verification does not check Firebase refresh-token revocation or
account-disabled status. Do not treat it as a complete authorization policy
for sensitive actions. Add a revocation-aware server check before using this
gateway for high-risk operations.

## Local verification

The Deno tests include mocked `accounts:lookup` responses and handler-level tests. They do not prove a live Firebase account lookup or a deployed Supabase function.

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
2. `FIREBASE_WEB_API_KEY` is configured server-side with appropriate Firebase API restrictions.
3. A real token from a dedicated test account succeeds against Firebase `accounts:lookup`.
4. Expired, modified, wrong-project, revoked, and disabled-account cases fail using dedicated test accounts.
5. CORS behavior is checked from the actual WarkopLink origin.
6. The owner explicitly approves deployment.

The function is configured with `verify_jwt = false` because Firebase ID tokens are not Supabase JWTs. This is safe only because this endpoint verifies Firebase tokens itself, including the server-side account-status lookup, before returning an identity. The source code is not deployed yet; keep the endpoint read-only and do not add upload/delete or service-role database operations to it.

No Firebase billing, Firebase configuration, production hosting, Supabase
database schema, storage bucket, or user data is changed by this source-only
change.
