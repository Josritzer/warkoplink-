import { validateFirebaseAccountLookupResponse } from "./account-lookup.ts";

const FIREBASE_LOOKUP_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Performs the server-side Firebase Auth status lookup after the ID token's
 * signature and claims have already been verified locally.
 *
 * The API key is a project identifier, never an authorization credential.
 * Any transport, HTTP, or response-validation failure rejects the request.
 */
export async function lookupFirebaseAccount(
  idToken: string,
  verifiedUid: string,
  authTimeSeconds: unknown,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ uid: string }> {
  if (
    typeof idToken !== "string" || idToken.length === 0 ||
    typeof verifiedUid !== "string" || verifiedUid.length === 0 ||
    typeof apiKey !== "string" || apiKey.trim().length === 0
  ) {
    throw new TypeError("Firebase lookup configuration or identity is invalid");
  }

  const url = new URL(FIREBASE_LOOKUP_ENDPOINT);
  url.searchParams.set("key", apiKey);

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error("Firebase account status lookup failed");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Firebase account status response was invalid");
  }

  return validateFirebaseAccountLookupResponse(
    payload,
    verifiedUid,
    authTimeSeconds,
  );
}
