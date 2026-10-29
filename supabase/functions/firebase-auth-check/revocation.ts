/**
 * Firebase Admin SDK-compatible revocation boundary check.
 *
 * Firebase accounts:lookup returns validSince as Unix seconds (string).
 * Admin SDK compares auth_time * 1000 < tokensValidAfterTime milliseconds.
 * Equality is accepted; only an auth_time strictly earlier than validSince
 * is revoked. Invalid/missing values must fail closed at the caller.
 */
export function isFirebaseTokenRevoked(
  authTimeSeconds: unknown,
  validSinceSeconds: unknown,
): boolean {
  if (
    typeof authTimeSeconds !== "number" ||
    !Number.isSafeInteger(authTimeSeconds) ||
    authTimeSeconds < 0
  ) {
    throw new TypeError("Invalid Firebase auth_time");
  }

  if (
    typeof validSinceSeconds !== "string" ||
    validSinceSeconds.trim() === "" ||
    !/^(?:\d+)(?:\.\d+)?$/.test(validSinceSeconds)
  ) {
    throw new TypeError("Invalid Firebase validSince");
  }

  const validSince = Number(validSinceSeconds);
  if (!Number.isFinite(validSince) || validSince < 0) {
    throw new TypeError("Invalid Firebase validSince");
  }

  return authTimeSeconds < validSince;
}
