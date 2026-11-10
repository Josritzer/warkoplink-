export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50_000_000;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MEDIA_TYPES = new Set(["avatar", "warung", "event", "video", "menu"]);

export function videoDurationForAccount(access: {
  verifiedWarkopOwner: boolean;
  thematicGroupMember: boolean;
}): number {
  if (access.verifiedWarkopOwner) return 180;
  if (access.thematicGroupMember) return 60;
  return 30;
}


export type MediaUploadRequest = {
  mediaType: "avatar" | "warung" | "event" | "video" | "menu";
  resourceId?: string;
  warungId?: string;
  menuItemId?: string;
  slot?: number;
  contentType: string;
  size: number;
};

function fail(message: string): never {
  throw new Error(message);
}

export function normalizeUploadRequest(input: Record<string, unknown>): MediaUploadRequest {
  if (typeof input.mediaType !== "string" || !MEDIA_TYPES.has(input.mediaType)) {
    return fail("Unsupported media category");
  }
  const mediaType = input.mediaType as MediaUploadRequest["mediaType"];
  const isVideo = mediaType === "video";
  const allowedType = isVideo
    ? input.contentType === "video/mp4"
    : typeof input.contentType === "string" && ALLOWED_IMAGE_TYPES.has(input.contentType);
  if (!allowedType) return fail(isVideo ? "Unsupported video type" : "Unsupported image type");
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (typeof input.size !== "number" || !Number.isSafeInteger(input.size) || input.size < 1 || input.size > maxBytes) {
    return fail(isVideo ? "Video size must be between 1 byte and 50 MB" : "Image size must be between 1 byte and 2 MiB");
  }
  if (mediaType === "menu") {
    const warungId = typeof input.warungId === "string" ? input.warungId.trim() : "";
    const menuItemId = typeof input.menuItemId === "string" ? input.menuItemId.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(warungId) || !/^[A-Za-z0-9_-]{1,150}$/.test(menuItemId)) {
      return fail("Menu upload requires valid warungId and menuItemId");
    }
    if (input.slot !== undefined || input.resourceId !== undefined) return fail("Menu upload uses warungId and menuItemId only");
    return { mediaType, warungId, menuItemId, contentType: input.contentType as string, size: input.size as number };
  }
  const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : "";
  if (mediaType !== "avatar" && (!resourceId || resourceId.length > 150 || !/^[A-Za-z0-9_-]+$/.test(resourceId))) {
    return fail("Invalid resource identifier");
  }
  if ((mediaType === "avatar" || mediaType === "video" || mediaType === "event") && input.slot !== undefined) {
    return fail(mediaType === "video" ? "Video does not accept a slot" : mediaType === "event" ? "Event poster has one slot" : "Avatar does not accept a slot");
  }
  if (mediaType === "warung" && (!Number.isInteger(input.slot) || (input.slot as number) < 0 || (input.slot as number) > 4)) {
    return fail("Warkop photo slot must be between 0 and 4");
  }
  return {
    mediaType,
    ...(mediaType !== "avatar" ? { resourceId } : {}),
    ...(mediaType === "warung" ? { slot: input.slot as number } : {}),
    contentType: input.contentType as string,
    size: input.size,
  };
}

export function validateImageBytes(bytes: Uint8Array, contentType: string): boolean {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > MAX_IMAGE_BYTES) return false;
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

/** Walk ISO-BMFF boxes, including extended-size boxes and multiple audio/video tracks. */
export function parseMp4Metadata(bytes: Uint8Array): { durationSeconds: number; width: number; height: number } | null {
  if (!(bytes instanceof Uint8Array) || bytes.length < 32 || bytes.length > MAX_VIDEO_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const typeAt = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
  const readU32 = (offset: number) => offset >= 0 && offset + 4 <= bytes.length ? view.getUint32(offset) : 0;
  const readBox = (offset: number, limit: number): { start: number; size: number; headerSize: number; type: string } | null => {
    if (offset < 0 || offset + 8 > limit || limit > bytes.length) return null;
    const size32 = readU32(offset);
    const type = typeAt(offset + 4);
    let size = size32;
    let headerSize = 8;
    if (size32 === 1) {
      if (offset + 16 > limit) return null;
      const extendedSize = view.getBigUint64(offset + 8);
      if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(extendedSize);
      headerSize = 16;
    } else if (size32 === 0) {
      size = limit - offset;
    }
    if (size < headerSize || offset + size > limit) return null;
    return { start: offset, size, headerSize, type };
  };

  const first = readBox(0, bytes.length);
  if (!first || first.type !== "ftyp" || first.size < 12) return null;

  const containers = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "mvex", "moof", "traf"]);
  const findBoxes = (
    from: number,
    to: number,
    wanted: string,
    depth = 0,
  ): Array<{ start: number; size: number; headerSize: number; type: string }> => {
    if (depth > 8) return [];
    const matches: Array<{ start: number; size: number; headerSize: number; type: string }> = [];
    let offset = from;
    while (offset + 8 <= to) {
      const box = readBox(offset, to);
      if (!box) break;
      if (box.type === wanted) matches.push(box);
      if (containers.has(box.type)) {
        matches.push(...findBoxes(offset + box.headerSize, offset + box.size, wanted, depth + 1));
      }
      offset += box.size;
    }
    return matches;
  };

  const topLevel = findBoxes(first.size, bytes.length, "moov");
  const mdat = findBoxes(first.size, bytes.length, "mdat");
  const moov = topLevel[0];
  if (!moov || !mdat.length) return null;
  const mvhd = findBoxes(moov.start + moov.headerSize, moov.start + moov.size, "mvhd")[0];
  const tracks = findBoxes(moov.start + moov.headerSize, moov.start + moov.size, "tkhd");
  if (!mvhd || mvhd.size < 28 || !tracks.length) return null;

  const version = bytes[mvhd.start + mvhd.headerSize];
  let timescale = 0;
  let duration = 0;
  if (version === 0) {
    timescale = readU32(mvhd.start + mvhd.headerSize + 12);
    duration = readU32(mvhd.start + mvhd.headerSize + 16);
  } else if (version === 1 && mvhd.size >= mvhd.headerSize + 32) {
    timescale = readU32(mvhd.start + mvhd.headerSize + 20);
    const rawDuration = view.getBigUint64(mvhd.start + mvhd.headerSize + 24);
    if (rawDuration > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    duration = Number(rawDuration);
  } else return null;

  // Audio tracks commonly precede video tracks and have zero dimensions.
  let dimensions: { width: number; height: number } | null = null;
  for (const tkhd of tracks) {
    if (tkhd.size < tkhd.headerSize + 8) continue;
    const trackVersion = bytes[tkhd.start + tkhd.headerSize];
    if (trackVersion !== 0 && trackVersion !== 1) continue;
    const width = Math.floor(readU32(tkhd.start + tkhd.size - 8) / 65536);
    const height = Math.floor(readU32(tkhd.start + tkhd.size - 4) / 65536);
    if (width >= 1 && height >= 1) {
      dimensions = { width, height };
      break;
    }
  }

  const durationSeconds = duration / timescale;
  if (!dimensions || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 180 ||
      Math.max(dimensions.width, dimensions.height) > 1920 ||
      Math.min(dimensions.width, dimensions.height) > 1080) return null;
  return { durationSeconds, ...dimensions };
}

function decodeValue(value: any): any {
  if (!value || typeof value !== "object") return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue?.values || []).map(decodeValue);
  if ("mapValue" in value) return parseFirestoreDocument({ fields: value.mapValue?.fields || {} });
  return undefined;
}

export function parseFirestoreDocument(document: any): Record<string, any> | null {
  if (!document || typeof document !== "object" || !document.fields || typeof document.fields !== "object") return null;
  return Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, decodeValue(value)]));
}

export function encodeFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (value instanceof Date && Number.isFinite(value.getTime())) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, encodeFirestoreValue(item)])) } };
  }
  return fail("Unsupported Firestore value");
}

export function mediaObjectPath(uid: string, mediaType: string, resourceId: string, uploadId: string, slot?: number, menuItemId?: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !/^[0-9a-f-]{36}$/i.test(uploadId)) {
    return fail("Invalid upload identity");
  }
  if (mediaType === "avatar") return `profiles/${uid}/${uploadId}.webp`;
  if (mediaType === "warung" && /^[A-Za-z0-9_-]{1,150}$/.test(resourceId)) return `warungs/${resourceId}/${slot}/${uploadId}.webp`;
  if (mediaType === "event" && /^[A-Za-z0-9_-]{1,150}$/.test(resourceId)) return `events/${resourceId}/${uploadId}.webp`;
  if (mediaType === "video" && /^[A-Za-z0-9_-]{1,150}$/.test(resourceId)) return `posts/${resourceId}/${uploadId}.mp4`;
  if (mediaType === "menu" && /^[A-Za-z0-9_-]{1,150}$/.test(resourceId) &&
      typeof menuItemId === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(menuItemId)) {
    return `menus/${resourceId}/${menuItemId}/${uploadId}.webp`;
  }
  return fail("Unsupported media category");
}

export function firestoreDocumentPath(collection: string, id: string): string {
  if (!["profiles", "publicProfiles", "warungs", "posts", "warungMenuItems"].includes(collection) ||
      !id || id.length > 150 || id.includes("/")) return fail("Invalid Firestore document path");
  return `${collection}/${id}`;
}

export type StorageObjectInfo = { name: string; id?: string | null; created_at?: string | null; updated_at?: string | null };

export function expiredOrphanPaths(
  folder: string,
  objects: StorageObjectInfo[],
  referencedPaths: Set<string>,
  now = Date.now(),
  retentionMs = 24 * 60 * 60 * 1000,
): string[] {
  const cutoff = now - retentionMs;
  return objects
    .filter((item) => {
      if (!item.id || !item.name) return false;
      const createdAt = Date.parse(item.created_at || item.updated_at || "");
      return Number.isFinite(createdAt) && createdAt < cutoff && !referencedPaths.has(`${folder}/${item.name}`);
    })
    .map((item) => `${folder}/${item.name}`);
}


export function isMenuUploadAuthorized(menu: Record<string, any> | null | undefined, warung: Record<string, any> | null | undefined, uid: string, warungId: string): boolean {
  return Boolean(menu && warung && typeof uid === "string" && uid && menu.ownerUid === uid && menu.warungId === warungId && warung.ownerUid === uid);
}

export function isMenuPhotoPubliclyPublishable(menu: Record<string, any> | null | undefined, warung: Record<string, any> | null | undefined, uid: string, warungId: string): boolean {
  return isMenuUploadAuthorized(menu, warung, uid, warungId) && menu!.status === "published" && menu!.isPublic === true && warung!.verificationStatus === "verified";
}

export function isPendingMenuPhotoUpload(menu: Record<string, any> | null | undefined, uploadId: string): boolean {
  return Boolean(menu && typeof uploadId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId) && menu.pendingPhotoUploadId === uploadId);
}

export function menuPhotoReferenceUpdate(currentPhotoUrl: unknown, nextPhotoUrl: string): { oldUrl: string | null; fieldPatch: { photoUrl: string } } {
  return { oldUrl: typeof currentPhotoUrl === "string" ? currentPhotoUrl : null, fieldPatch: { photoUrl: nextPhotoUrl } };
}
