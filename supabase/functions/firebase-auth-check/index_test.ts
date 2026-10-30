import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  createHandler,
  extractBearerToken,
  isAllowedOrigin,
  validateFirebaseTimeClaims,
} from "./index.ts";
import { isFirebaseTokenRevoked } from "./revocation.ts";

Deno.test("extracts a Bearer token case-insensitively", () => {
  assertEquals(extractBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assertEquals(extractBearerToken("bearer token-value"), "token-value");
});

Deno.test("rejects malformed or missing authorization headers", () => {
  assertEquals(extractBearerToken(null), null);
  assertEquals(extractBearerToken("Basic abc"), null);
  assertEquals(extractBearerToken("Bearer "), null);
  assertEquals(extractBearerToken("Bearer token extra"), null);
});

Deno.test("allows only configured browser origins", () => {
  assertEquals(isAllowedOrigin("https://sl-community-platform.web.app"), true);
  assertEquals(isAllowedOrigin("https://sl-community-platform.firebaseapp.com"), true);
  assertEquals(isAllowedOrigin("https://attacker.example"), false);
  assertEquals(isAllowedOrigin(null), true);
});

Deno.test("requires valid exp, iat, and auth_time claims", () => {
  const now = 1_800_000_000;
  const valid = { exp: now + 3600, iat: now - 10, auth_time: now - 20 };
  assertEquals(validateFirebaseTimeClaims(valid, now), true);
  assertEquals(validateFirebaseTimeClaims({ ...valid, exp: undefined }, now), false);
  assertEquals(validateFirebaseTimeClaims({ ...valid, iat: undefined }, now), false);
  assertEquals(validateFirebaseTimeClaims({ ...valid, auth_time: undefined }, now), false);
});

Deno.test("rejects expired, future-issued, and inconsistent time claims", () => {
  const now = 1_800_000_000;
  assertEquals(
    validateFirebaseTimeClaims(
      { exp: now - 10, iat: now - 3600, auth_time: now - 3700 },
      now,
    ),
    false,
  );
  assertEquals(
    validateFirebaseTimeClaims(
      { exp: now + 3600, iat: now + 30, auth_time: now },
      now,
    ),
    false,
  );
  assertEquals(
    validateFirebaseTimeClaims(
      { exp: now + 3600, iat: now - 10, auth_time: now + 30 },
      now,
    ),
    false,
  );
  assertEquals(
    validateFirebaseTimeClaims(
      { exp: now + 3600, iat: now - 10, auth_time: now - 100 },
      now,
    ),
    true,
  );
});

Deno.test("matches Firebase Admin SDK revocation boundary semantics", () => {
  const validSince = "1800000000";
  assertEquals(isFirebaseTokenRevoked(1_799_999_999, validSince), true);
  assertEquals(isFirebaseTokenRevoked(1_800_000_000, validSince), false);
  assertEquals(isFirebaseTokenRevoked(1_800_000_001, validSince), false);
});

Deno.test("supports fractional validSince seconds without rounding", () => {
  assertEquals(isFirebaseTokenRevoked(1_800_000_000, "1800000000.5"), true);
  assertEquals(isFirebaseTokenRevoked(1_800_000_001, "1800000000.5"), false);
});

Deno.test("fails closed for malformed or missing revocation timestamps", () => {
  for (const invalid of [undefined, null, "", " ", "NaN", "-1", "1e9", "Infinity"]) {
    assertThrows(() => isFirebaseTokenRevoked(1_800_000_000, invalid));
  }
  for (const invalid of [undefined, null, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertThrows(() => isFirebaseTokenRevoked(invalid, "1800000000"));
  }
});


import { validateFirebaseAccountLookupResponse } from "./account-lookup.ts";

Deno.test("accepts one enabled account whose UID matches and token is current", () => {
  assertEquals(
    validateFirebaseAccountLookupResponse(
      { users: [{ localId: "verified-uid", disabled: false, validSince: "1800000000" }] },
      "verified-uid",
      1_800_000_000,
    ),
    { uid: "verified-uid" },
  );
});

Deno.test("rejects disabled accounts and unknown disabled status", () => {
  for (const disabled of [true, undefined, null, "false", 0]) {
    let thrown = false;
    try {
      validateFirebaseAccountLookupResponse(
        { users: [{ localId: "verified-uid", disabled, validSince: "1800000000" }] },
        "verified-uid",
        1_800_000_000,
      );
    } catch {
      thrown = true;
    }
    assertEquals(thrown, true);
  }
});

Deno.test("rejects a mismatched UID and invalid account counts", () => {
  const validUser = { localId: "other-uid", disabled: false, validSince: "1800000000" };
  for (const payload of [
    { users: [validUser] },
    { users: [] },
    { users: [validUser, validUser] },
    {},
    null,
  ]) {
    let thrown = false;
    try {
      validateFirebaseAccountLookupResponse(payload, "verified-uid", 1_800_000_000);
    } catch {
      thrown = true;
    }
    assertEquals(thrown, true);
  }
});

Deno.test("rejects revoked tokens and malformed validSince values", () => {
  let revoked = false;
  try {
    validateFirebaseAccountLookupResponse(
      { users: [{ localId: "verified-uid", disabled: false, validSince: "1800000001" }] },
      "verified-uid",
      1_800_000_000,
    );
  } catch {
    revoked = true;
  }
  assertEquals(revoked, true);

  for (const validSince of [undefined, null, "", "not-a-time", "-1"]) {
    let thrown = false;
    try {
      validateFirebaseAccountLookupResponse(
        { users: [{ localId: "verified-uid", disabled: false, validSince }] },
        "verified-uid",
        1_800_000_000,
      );
    } catch {
      thrown = true;
    }
    assertEquals(thrown, true);
  }
});

Deno.test("fails closed for invalid verified UID or auth_time", () => {
  for (const [uid, authTime] of [["", 1_800_000_000], ["verified-uid", -1], ["verified-uid", 1.5]] as const) {
    let thrown = false;
    try {
      validateFirebaseAccountLookupResponse(
        { users: [{ localId: "verified-uid", disabled: false, validSince: "1800000000" }] },
        uid,
        authTime,
      );
    } catch {
      thrown = true;
    }
    assertEquals(thrown, true);
  }
});

import { lookupFirebaseAccount } from "./firebase-auth-rest.ts";

Deno.test("REST lookup accepts only a matching enabled, current account", async () => {
  const result = await lookupFirebaseAccount(
    "verified-token",
    "verified-uid",
    1_800_000_000,
    "test-api-key",
    async (input, init) => {
      assertEquals(String(input), "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-api-key");
      assertEquals(init?.method, "POST");
      assertEquals(init?.headers, { "Content-Type": "application/json" });
      const body = JSON.parse(String(init?.body));
      assertEquals(body.idToken, "verified-token");
      return Response.json({
        users: [{ localId: "verified-uid", disabled: false, validSince: "1800000000" }],
      });
    },
  );
  assertEquals(result, { uid: "verified-uid" });
});

Deno.test("REST lookup fails closed on HTTP errors and malformed JSON", async () => {
  for (const fetchImpl of [
    async () => new Response("denied", { status: 403 }),
    async () => new Response("{not-json", { status: 200 }),
    async () => { throw new Error("network unavailable"); },
  ]) {
    let rejected = false;
    try {
      await lookupFirebaseAccount(
        "verified-token",
        "verified-uid",
        1_800_000_000,
        "test-api-key",
        fetchImpl,
      );
    } catch {
      rejected = true;
    }
    assertEquals(rejected, true);
  }
});

Deno.test("REST lookup fails closed for empty credentials and invalid account responses", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return Response.json({ users: [] });
  };
  for (const [token, uid, apiKey] of [
    ["", "verified-uid", "test-api-key"],
    ["verified-token", "", "test-api-key"],
    ["verified-token", "verified-uid", ""],
  ] as const) {
    let rejected = false;
    try {
      await lookupFirebaseAccount(token, uid, 1_800_000_000, apiKey, fetchImpl);
    } catch {
      rejected = true;
    }
    assertEquals(rejected, true);
  }
  assertEquals(called, false);
});


Deno.test("accepts a Firebase token only after account status and revocation lookup", async () => {
  const handler = createHandler({
    apiKey: "test-api-key",
    verifyToken: async (token) => {
      assertEquals(token, "firebase-id-token");
      return { uid: "verified-uid", authTime: 1_800_000_000 };
    },
    lookupAccount: async (token, uid, authTime, apiKey) => {
      assertEquals(token, "firebase-id-token");
      assertEquals(uid, "verified-uid");
      assertEquals(authTime, 1_800_000_000);
      assertEquals(apiKey, "test-api-key");
      return { uid };
    },
  });

  const response = await handler(new Request("https://example.test", {
    method: "POST",
    headers: {
      Authorization: "Bearer firebase-id-token",
      Origin: "https://sl-community-platform.web.app",
    },
  }));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { authenticated: true, uid: "verified-uid" });
});

Deno.test("rejects the request when Firebase account status lookup fails", async () => {
  const handler = createHandler({
    apiKey: "test-api-key",
    verifyToken: async () => ({ uid: "verified-uid", authTime: 1_800_000_000 }),
    lookupAccount: async () => {
      throw new Error("disabled or revoked account");
    },
  });

  const response = await handler(new Request("https://example.test", {
    method: "POST",
    headers: {
      Authorization: "Bearer firebase-id-token",
      Origin: "https://sl-community-platform.web.app",
    },
  }));

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Invalid or expired Firebase ID token" });
});

Deno.test("fails closed when the Firebase Web API key is not configured", async () => {
  const handler = createHandler({
    apiKey: "",
    verifyToken: async () => ({ uid: "verified-uid", authTime: 1_800_000_000 }),
  });

  const response = await handler(new Request("https://example.test", {
    method: "POST",
    headers: {
      Authorization: "Bearer firebase-id-token",
      Origin: "https://sl-community-platform.web.app",
    },
  }));

  assertEquals(response.status, 401);
});


Deno.test("reports disabled Firebase accounts separately from revoked sessions", () => {
  let disabledMessage = "";
  try {
    validateFirebaseAccountLookupResponse(
      { users: [{ localId: "verified-uid", disabled: true, validSince: "1800000000" }] },
      "verified-uid",
      1_800_000_000,
    );
  } catch (error) {
    disabledMessage = error instanceof Error ? error.message : "";
  }
  assertEquals(disabledMessage, "Firebase account is disabled or status is unknown");

  let revokedMessage = "";
  try {
    validateFirebaseAccountLookupResponse(
      { users: [{ localId: "verified-uid", disabled: false, validSince: "1800000001" }] },
      "verified-uid",
      1_800_000_000,
    );
  } catch (error) {
    revokedMessage = error instanceof Error ? error.message : "";
  }
  assertEquals(revokedMessage, "Firebase ID token has been revoked");
});
