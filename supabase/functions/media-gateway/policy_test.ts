import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  videoDurationForAccount,
  parseMp4Metadata,
  normalizeUploadRequest,
  parseFirestoreDocument,
  validateImageBytes,
  mediaObjectPath,
  expiredOrphanPaths,
  isMenuUploadAuthorized,
  isMenuPhotoPubliclyPublishable,
  isPendingMenuPhotoUpload,
  menuPhotoReferenceUpdate,
  firestoreDocumentPath,
} from "./policy.ts";

Deno.test("recognizes avatar, warung, event, and video media without category fallthrough", () => {
  assertEquals(normalizeUploadRequest({ mediaType: "avatar", contentType: "image/jpeg", size: 100 }).mediaType, "avatar");
  assertEquals(normalizeUploadRequest({ mediaType: "warung", resourceId: "warung-1", slot: 4, contentType: "image/png", size: 100 }).slot, 4);
  assertEquals(normalizeUploadRequest({ mediaType: "event", resourceId: "post-1", contentType: "image/webp", size: 100 }).mediaType, "event");
  assertEquals(normalizeUploadRequest({ mediaType: "video", resourceId: "post-1", contentType: "video/mp4", size: 100 }).mediaType, "video");
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
  assertEquals(MAX_VIDEO_BYTES, 50_000_000);
});

Deno.test("uses a dedicated MP4 object path for feed videos", () => {
  const id = "a12b4567-89ab-4cde-8fab-1234567890ab";
  assertEquals(mediaObjectPath("user_1", "video", "post_1", id), `posts/post_1/${id}.mp4`);
});

function mp4Box(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(payload, 8);
  return bytes;
}

function mp4Concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function mp4Track(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(84);
  const view = new DataView(payload.buffer);
  view.setUint32(76, width * 65536);
  view.setUint32(80, height * 65536);
  return mp4Box("trak", mp4Box("tkhd", payload));
}

function realisticMp4Fixture(extendedMdat = false): Uint8Array {
  const ftyp = mp4Box("ftyp", new Uint8Array([105,115,111,109,0,0,2,0]));
  const mvhdPayload = new Uint8Array(20);
  const mvhdView = new DataView(mvhdPayload.buffer);
  mvhdView.setUint32(12, 1000);
  mvhdView.setUint32(16, 3000);
  const moov = mp4Box("moov", mp4Concat(
    mp4Box("mvhd", mvhdPayload),
    mp4Track(0, 0), // Audio track may appear before the video track.
    mp4Track(1280, 720),
  ));
  const mdat = extendedMdat
    ? new Uint8Array([0,0,0,1,109,100,97,116,0,0,0,0,0,0,0,16])
    : mp4Box("mdat", new Uint8Array(0));
  return mp4Concat(ftyp, moov, mdat);
}

Deno.test("selects the video track when an audio track appears first", () => {
  assertEquals(parseMp4Metadata(realisticMp4Fixture()), { durationSeconds: 3, width: 1280, height: 720 });
});

Deno.test("accepts MP4 boxes that use 64-bit extended sizes", () => {
  assertEquals(parseMp4Metadata(realisticMp4Fixture(true)), { durationSeconds: 3, width: 1280, height: 720 });
});

Deno.test("extracts MP4 duration and dimensions from bounded metadata", () => {
  const metadata = new Uint8Array([
    // ftyp
    0,0,0,16, 102,116,121,112, 105,115,111,109, 0,0,2,0,
    // moov -> mvhd (version 0, timescale 1000, duration 45000 ms)
    0,0,0,128, 109,111,111,118,
    0,0,0,28, 109,118,104,100, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,3,232, 0,0,175,200,
    // tkhd (version 0, width 1920, height 1080, 16.16 fixed point)
    0,0,0,92, 116,107,104,100, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1,
    ...new Array(60).fill(0), 7,128,0,0, 4,56,0,0,
    // empty but structurally valid media-data box for the metadata fixture
    0,0,0,8, 109,100,97,116
  ]);
  assertEquals(parseMp4Metadata(metadata), { durationSeconds: 45, width: 1920, height: 1080 });
});

Deno.test("rejects malformed or oversized MP4 metadata", () => {
  assertEquals(parseMp4Metadata(new TextEncoder().encode("not a video")), null);
  assertEquals(parseMp4Metadata(new Uint8Array(8)), null);
});


Deno.test("applies the approved feed-video duration tiers", () => {
  assertEquals(videoDurationForAccount({ verifiedWarkopOwner: false, thematicGroupMember: false }), 30);
  assertEquals(videoDurationForAccount({ verifiedWarkopOwner: false, thematicGroupMember: true }), 60);
  assertEquals(videoDurationForAccount({ verifiedWarkopOwner: true, thematicGroupMember: false }), 180);
  assertEquals(videoDurationForAccount({ verifiedWarkopOwner: true, thematicGroupMember: true }), 180);
});

Deno.test("normalizes menu uploads with explicit warungId and menuItemId", () => {
  const request = normalizeUploadRequest({ mediaType: "menu", warungId: "warung_1", menuItemId: "menu_1", contentType: "image/webp", size: 2048 });
  assertEquals(request.mediaType, "menu"); assertEquals(request.warungId, "warung_1"); assertEquals(request.menuItemId, "menu_1"); assertEquals(request.resourceId, undefined);
  assertThrows(() => normalizeUploadRequest({ mediaType: "menu", menuItemId: "menu_1", contentType: "image/webp", size: 100 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "menu", warungId: "warung_1", contentType: "image/webp", size: 100 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "menu", warungId: "../warung", menuItemId: "menu_1", contentType: "image/webp", size: 100 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "menu", warungId: "warung_1", menuItemId: "../event", contentType: "image/webp", size: 100 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "menu", warungId: "warung_1", menuItemId: "menu_1", contentType: "image/svg+xml", size: 100 }));
  assertThrows(() => normalizeUploadRequest({ mediaType: "menu", warungId: "warung_1", menuItemId: "menu_1", contentType: "image/webp", size: MAX_IMAGE_BYTES + 1 }));
});

Deno.test("builds a menu-specific object path and never an event path", () => {
  const id = "a12b4567-89ab-4cde-8fab-1234567890ab";
  assertEquals(mediaObjectPath("user_1", "menu", "warung_1", id, undefined, "menu_1"), `menus/warung_1/menu_1/${id}.webp`);
  assertEquals(mediaObjectPath("user_1", "event", "post_1", id), `events/post_1/${id}.webp`);
  assertThrows(() => mediaObjectPath("user_1", "menu", "warung_1", id));
});

Deno.test("requires ownership of both the menu item and parent warkop", () => {
  const menu = { ownerUid: "owner_1", warungId: "warung_1", status: "draft", isPublic: false };
  const warung = { ownerUid: "owner_1", verificationStatus: "pending" };
  assertEquals(isMenuUploadAuthorized(menu, warung, "owner_1", "warung_1"), true);
  assertEquals(isMenuUploadAuthorized({ ...menu, ownerUid: "other" }, warung, "owner_1", "warung_1"), false);
  assertEquals(isMenuUploadAuthorized(menu, { ...warung, ownerUid: "other" }, "owner_1", "warung_1"), false);
  assertEquals(isMenuUploadAuthorized(menu, warung, "owner_1", "different-warung"), false);
});

Deno.test("keeps draft and unverified menu photos quarantined until publication is allowed", () => {
  const warung = { ownerUid: "owner_1", verificationStatus: "verified" };
  const base = { ownerUid: "owner_1", warungId: "warung_1", status: "draft", isPublic: false };
  assertEquals(isMenuPhotoPubliclyPublishable(base, warung, "owner_1", "warung_1"), false);
  assertEquals(isMenuPhotoPubliclyPublishable({ ...base, status: "published", isPublic: true }, { ...warung, verificationStatus: "pending" }, "owner_1", "warung_1"), false);
  assertEquals(isMenuPhotoPubliclyPublishable({ ...base, status: "published", isPublic: true }, warung, "owner_1", "warung_1"), true);
  assertEquals(isMenuPhotoPubliclyPublishable({ ...base, status: "archived", isPublic: true }, warung, "owner_1", "warung_1"), false);
  assertEquals(isMenuPhotoPubliclyPublishable({ ...base, status: "published", isPublic: true, ownerUid: "other" }, warung, "owner_1", "warung_1"), false);
});

Deno.test("replaces a menu photo reference while preserving the previous URL for cleanup", () => {
  assertEquals(menuPhotoReferenceUpdate("https://old.example/menu.webp", "https://new.example/menu.webp"), { oldUrl: "https://old.example/menu.webp", fieldPatch: { photoUrl: "https://new.example/menu.webp" } });
  assertEquals(menuPhotoReferenceUpdate(null, "https://new.example/menu.webp"), { oldUrl: null, fieldPatch: { photoUrl: "https://new.example/menu.webp" } });
});

Deno.test("resolves menu item documents without changing existing Firestore resource paths", () => {
  assertEquals(firestoreDocumentPath("warungMenuItems", "menu_1"), "warungMenuItems/menu_1");
  assertEquals(firestoreDocumentPath("warungs", "warung_1"), "warungs/warung_1");
  assertThrows(() => firestoreDocumentPath("warungMenuItems", "../other"));
});

Deno.test("only the exact pending photo upload recorded on a menu can be published", () => {
  const uploadId = "123e4567-e89b-12d3-a456-426614174000";
  assertEquals(isPendingMenuPhotoUpload({ pendingPhotoUploadId: uploadId }, uploadId), true);
  assertEquals(isPendingMenuPhotoUpload({ pendingPhotoUploadId: "123e4567-e89b-12d3-a456-426614174001" }, uploadId), false);
  assertEquals(isPendingMenuPhotoUpload({}, uploadId), false);
  assertEquals(isPendingMenuPhotoUpload({ pendingPhotoUploadId: uploadId }, "invalid"), false);
});
