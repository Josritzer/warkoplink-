import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  MAX_IMAGE_BYTES,
  normalizeUploadRequest,
  parseFirestoreDocument,
  validateImageBytes,
  mediaObjectPath,
  expiredOrphanPaths,
} from "./policy.ts";

Deno.test("accepts only avatar, warung and event media", () => {
  assertEquals(normalizeUploadRequest({ mediaType: "avatar", contentType: "image/jpeg", size: 100 }).mediaType, "avatar");
  assertEquals(normalizeUploadRequest({ mediaType: "warung", resourceId: "warung-1", slot: 4, contentType: "image/png", size: 100 }).slot, 4);
  assertEquals(normalizeUploadRequest({ mediaType: "event", resourceId: "post-1", contentType: "image/webp", size: 100 }).mediaType, "event");
  for (const mediaType of ["post", "video", "document", ""]) {
    assertThrows(() => normalizeUploadRequest({ mediaType, contentType: "image/jpeg", size: 100 }));
  }
});

Deno.test("rejects MIME spoof declarations and invalid byte limits", () => {
  for (const contentType of ["image/svg+xml", "image/gif", "text/html", "application/octet-stream", ""]) {
    assertThrows(() => normalizeUploadRequest({ mediaType: "avatar", contentType, size: 100 }));
  }
  assertThrows(() => normalizeUploadRequest({ mediaType: "avatar", contentType: "image/jpeg", size: 0 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "avatar", contentType: "image/jpeg", size: MAX_IMAGE_BYTES + 1 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "avatar", contentType: "image/jpeg", size: 1.5 }));
});

Deno.test("checks byte signatures rather than trusting declared MIME", () => {
  const jpeg = new Uint8Array([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0xff,0xd9]);
  const png = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
  const webp = new Uint8Array([0x52,0x49,0x46,0x46,0x04,0,0,0,0x57,0x45,0x42,0x50]);
  assertEquals(validateImageBytes(jpeg, "image/jpeg"), true);
  assertEquals(validateImageBytes(png, "image/png"), true);
  assertEquals(validateImageBytes(webp, "image/webp"), true);
  assertEquals(validateImageBytes(jpeg, "image/png"), false);
  assertEquals(validateImageBytes(new TextEncoder().encode("<svg/>"), "image/jpeg"), false);
});

Deno.test("parses Firestore REST values safely", () => {
  const doc = { fields: {
    ownerUid: { stringValue: "u1" },
    verificationStatus: { stringValue: "verified" },
    photos: { arrayValue: { values: [{ stringValue: "https://old.example/a.jpg" }] } },
  } };
  const parsed = parseFirestoreDocument(doc);
  assertEquals(parsed?.ownerUid, "u1");
  assertEquals(parsed?.verificationStatus, "verified");
  assertEquals(parsed?.photos, ["https://old.example/a.jpg"]);
  assertEquals(parseFirestoreDocument(null), null);
  assertEquals(parseFirestoreDocument({ fields: {} }), {});
});

Deno.test("enforces sequential five-photo slots and one event poster", () => {
  assertEquals(normalizeUploadRequest({ mediaType: "warung", resourceId: "w1", slot: 0, contentType: "image/jpeg", size: 10 }).slot, 0);
  assertThrows(() => normalizeUploadRequest({ mediaType: "warung", resourceId: "w1", slot: 5, contentType: "image/jpeg", size: 10 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "warung", resourceId: "w1", slot: -1, contentType: "image/jpeg", size: 10 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "event", resourceId: "p1", slot: 1, contentType: "image/jpeg", size: 10 }));
});

Deno.test("removes only old unreferenced objects from a resource folder", () => {
  const now = Date.parse("2026-10-31T00:00:00Z");
  const objects = [
    { name: "old.webp", id: "1", created_at: "2026-10-29T00:00:00Z" },
    { name: "current.webp", id: "2", created_at: "2026-10-29T00:00:00Z" },
    { name: "recent.webp", id: "3", created_at: "2026-10-30T23:00:00Z" },
    { name: "folder", id: null, created_at: "2026-10-20T00:00:00Z" },
  ];
  assertEquals(
    expiredOrphanPaths("events/post_1", objects, new Set(["events/post_1/current.webp"]), now),
    ["events/post_1/old.webp"],
  );
});

Deno.test("uses server-controlled UUID object paths scoped to the authenticated owner", () => {
  const id = "a12b4567-89ab-4cde-8fab-1234567890ab";
  assertEquals(mediaObjectPath("user_1", "avatar", "user_1", id), `profiles/user_1/${id}.webp`);
  assertEquals(mediaObjectPath("user_1", "warung", "warung_1", id, 2), `warungs/warung_1/2/${id}.webp`);
  assertEquals(mediaObjectPath("user_1", "event", "post_1", id), `events/post_1/${id}.webp`);
  assertThrows(() => mediaObjectPath("bad/uid", "avatar", "x", id));
  assertThrows(() => mediaObjectPath("u1", "warung", "../other", id, 0));
});
