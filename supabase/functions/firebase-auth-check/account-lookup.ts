import { isFirebaseTokenRevoked } from "./revocation.ts";

type FirebaseLookupUser = {
  localId?: unknown;
  disabled?: unknown;
  validSince?: unknown;
};

/**
 * Validate the minimal Firebase accounts:lookup response needed for
 * revocation-aware identity checks. Never return or expose profile data.
 */
export function validateFirebaseAccountLookupResponse(
  payload: unknown,
  expectedUid: string,
  authTimeSeconds: unknown,
): { uid: string } {
  if (
    typeof expectedUid !== "string" ||
    expectedUid.length === 0 ||
    expectedUid.length > 128
  ) {
    throw new TypeError("Invalid expected Firebase UID");
  }

  if (
    payload === null ||
    typeof payload !== "object" ||
    !("users" in payload) ||
    !Array.isArray(payload.users) ||
    payload.users.length !== 1
  ) {
    throw new TypeError("Invalid Firebase account lookup response");
  }

  const user = payload.users[0] as FirebaseLookupUser | null;
  if (user === null || typeof user !== "object") {
    throw new TypeError("Invalid Firebase account lookup user");
  }

  if (user.localId !== expectedUid) {
    throw new TypeError("Firebase account UID mismatch");
  }

  if (typeof user.disabled !== "boolean" || user.disabled !== false) {
    throw new TypeError("Firebase account is disabled or status is unknown");
  }

  if (isFirebaseTokenRevoked(authTimeSeconds, user.validSince)) {
    throw new TypeError("Firebase ID token has been revoked");
  }

  return { uid: expectedUid };
}
