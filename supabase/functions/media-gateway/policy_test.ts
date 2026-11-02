import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  parseMp4Metadata,
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
  for (const mediaType of ["post", "document", ""]) {
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


Deno.test("accepts bounded MP4 video uploads without changing image limits", () => {
  assertEquals(normalizeUploadRequest({ mediaType: "video", resourceId: "post-1", contentType: "video/mp4", size: 25 * 1024 * 1024 }).mediaType, "video");
  assertThrows(() => normalizeUploadRequest({ mediaType: "video", resourceId: "post-1", contentType: "video/quicktime", size: 1024 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "video", resourceId: "post-1", contentType: "video/mp4", size: 50_000_000 + 1 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "video", resourceId: "../other", contentType: "video/mp4", size: 1024 }));
  assertEquals(MAX_IMAGE_BYTES, 2 * 1024 * 1024);
  assertEquals(MAX_VIDEO_BYTES, 50 * 1024 * 1024);
});

Deno.test("uses a dedicated MP4 object path for feed videos", () => {
  const id = "a12b4567-89ab-4cde-8fab-1234567890ab";
  assertEquals(mediaObjectPath("user_1", "video", "post_1", id), `posts/post_1/${id}.mp4`);
});

Deno.test("extracts MP4 duration and dimensions from bounded metadata", () => {
  const metadata = new Uint8Array([
    // ftyp
    0,0,0,16, 102,116,121,112, 105,115,111,109, 0,0,2,0,
    // moov -> mvhd (version 0, timescale 1000, duration 45000 ms)
    0,0,0,124, 109,111,111,118,
    0,0,0,28, 109,118,104,100, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,3,232, 0,0,175,200,
    // tkhd (version 0, width 1920, height 1080, 16.16 fixed point)
    0,0,0,88, 116,107,104,100, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1,
    ...new Array(52).fill(0), 7,128,0,0, 4,56,0,0,
    // empty but structurally valid media-data box for the metadata fixture
    0,0,0,8, 109,100,97,116
  ]);
  assertEquals(parseMp4Metadata(metadata), { durationSeconds: 45, width: 1920, height: 1080 });
});

Deno.test("rejects malformed or oversized MP4 metadata", () => {
  assertEquals(parseMp4Metadata(new TextEncoder().encode("not a video")), null);
  assertEquals(parseMp4Metadata(new Uint8Array(8)), null);
});
