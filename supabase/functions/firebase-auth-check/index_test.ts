import { assertEquals } from "jsr:@std/assert@1";
import { extractBearerToken, isAllowedOrigin } from "./index.ts";

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
