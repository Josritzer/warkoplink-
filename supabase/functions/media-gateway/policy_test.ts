import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  MAX_IMAGE_BYTES,
  normalizeUploadRequest,
  parseFirestoreDocument,
  validateImageBytes,
} from "./policy.ts";

Deno.test("accepts only the three supported media categories", () => {
  assertEquals(normalizeUploadRequest({ mediaType: "avatar", contentType: "image/jpeg", size: 100 }).mediaType, "avatar");
  assertEquals(normalizeUploadRequest({ mediaType: "warung", resourceId: "warung-1", slot: 4, contentType: "image/png", size: 100 }).slot, 4);
  assertEquals(normalizeUploadRequest({ mediaType: "event", resourceId: "post-1", contentType: "image/webp", size: 100 }).mediaType, "event");
  for (const mediaType of ["post", "video", "document", ""]) {
    assertThrows(() => normalizeUploadRequest({ mediaType, contentType: "image/jpeg", size: 100 }));
  }
});

Deno.test("rejects MIME spoofing declarations and invalid byte limits", () => {
  for (const contentType of ["image/svg+xml", "image/gif", "text/html", "application/octet-stream", ""]) {
    assertThrows(() => normalizeUploadRequest({ mediaType: "avatar", contentType, size: 100 }));
  }
  assertThrows(() => normalizeUploadRequest({ mediaType: "avatar", contentType: "image/jpeg", size: 0 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "avatar", contentType: "image/jpeg", size: MAX_IMAGE_BYTES + 1 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "avatar", contentType: "image/jpeg", size: 1.5 }));
});

Deno.test("validates the actual file signature against the declared MIME type", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = new Uint8Array([0x52,0x49,0x46,0x46,0x04,0,0,0,0x57,0x45,0x42,0x50]);
  assertEquals(validateImageBytes(jpeg, "image/jpeg"), true);
  assertEquals(validateImageBytes(png, "image/png"), true);
  assertEquals(validateImageBytes(webp, "image/webp"), true);
  assertEquals(validateImageBytes(jpeg, "image/png"), false);
  assertEquals(validateImageBytes(new TextEncoder().encode("<svg/>"), "image/jpeg"), false);
});

Deno.test("parses Firestore REST fields without trusting missing or wrong types", () => {
  const doc = {
    name: "projects/sl-community-platform/databases/(default)/documents/warungs/w1",
    fields: {
      ownerUid: { stringValue: "u1" },
      verificationStatus: { stringValue: "verified" },
      photos: { arrayValue: { values: [{ stringValue: "https://old.example/a.jpg" }] } },
    },
  };
  const parsed = parseFirestoreDocument(doc);
  assertEquals(parsed.ownerUid, "u1");
  assertEquals(parsed.verificationStatus, "verified");
  assertEquals(parsed.photos, ["https://old.example/a.jpg"]);
  assertEquals(parseFirestoreDocument(null), null);
  assertEquals(parseFirestoreDocument({ fields: {} }), {});
});

Deno.test("slot rules are bounded and event posters are a single slot", () => {
  assertEquals(normalizeUploadRequest({ mediaType: "warung", resourceId: "w1", slot: 0, contentType: "image/jpeg", size: 10 }).slot, 0);
  assertThrows(() => normalizeUploadRequest({ mediaType: "warung", resourceId: "w1", slot: 5, contentType: "image/jpeg", size: 10 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "warung", resourceId: "w1", slot: -1, contentType: "image/jpeg", size: 10 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "event", resourceId: "p1", slot: 1, contentType: "image/jpeg", size: 10 }));
});
