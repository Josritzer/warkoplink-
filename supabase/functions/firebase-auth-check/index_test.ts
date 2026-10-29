import { assertEquals } from "jsr:@std/assert@1";
import {
  extractBearerToken,
  isAllowedOrigin,
  validateFirebaseTimeClaims,
} from "./index.ts";

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
