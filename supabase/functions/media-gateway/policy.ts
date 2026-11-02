export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MEDIA_TYPES = new Set(["avatar", "warung", "event", "video"]);

export type MediaUploadRequest = {
  mediaType: "avatar" | "warung" | "event" | "video";
  resourceId?: string;
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
    return fail(isVideo ? "Video size must be between 1 byte and 50 MiB" : "Image size must be between 1 byte and 2 MiB");
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

/** Walk ISO-BMFF box boundaries and extract the container duration and track dimensions. */
export function parseMp4Metadata(bytes: Uint8Array): { durationSeconds: number; width: number; height: number } | null {
  if (!(bytes instanceof Uint8Array) || bytes.length < 32 || bytes.length > MAX_VIDEO_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const typeAt = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
  const readU32 = (offset: number) => offset >= 0 && offset + 4 <= bytes.length ? view.getUint32(offset) : 0;
  if (typeAt(4) !== "ftyp") return null;
  const ftypSize = readU32(0);
  if (ftypSize < 12 || ftypSize > bytes.length) return null;

  const findBox = (from: number, to: number, wanted: string, depth = 0): { start: number; size: number } | null => {
    if (depth > 5) return null;
    let offset = from;
    while (offset + 8 <= to) {
      const size = readU32(offset);
      const type = typeAt(offset + 4);
      if (size < 8 || offset + size > to) return null;
      if (type === wanted) return { start: offset, size };
      if (type === "trak") {
        const nested = findBox(offset + 8, offset + size, wanted, depth + 1);
        if (nested) return nested;
      }
      offset += size;
    }
    return null;
  };

  const moov = findBox(ftypSize, bytes.length, "moov");
  if (!moov) return null;
  const mvhd = findBox(moov.start + 8, moov.start + moov.size, "mvhd");
  const tkhd = findBox(moov.start + 8, moov.start + moov.size, "tkhd");
  if (!mvhd || !tkhd || mvhd.size < 28 || tkhd.size < 24) return null;

  const version = bytes[mvhd.start + 8];
  let timescale = 0;
  let duration = 0;
  if (version === 0) {
    timescale = readU32(mvhd.start + 20);
    duration = readU32(mvhd.start + 24);
  } else if (version === 1 && mvhd.size >= 40) {
    timescale = readU32(mvhd.start + 28);
    const rawDuration = view.getBigUint64(mvhd.start + 32);
    if (rawDuration > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    duration = Number(rawDuration);
  } else return null;

  const tkhdVersion = bytes[tkhd.start + 8];
  if (tkhdVersion !== 0 && tkhdVersion !== 1) return null;
  const width = Math.floor(readU32(tkhd.start + tkhd.size - 8) / 65536);
  const height = Math.floor(readU32(tkhd.start + tkhd.size - 4) / 65536);
  const durationSeconds = duration / timescale;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 180 ||
      !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      Math.max(width, height) > 1920 || Math.min(width, height) > 1080) return null;
  return { durationSeconds, width, height };
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

export function mediaObjectPath(uid: string, mediaType: string, resourceId: string, uploadId: string, slot?: number): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !/^[0-9a-f-]{36}$/i.test(uploadId)) {
    return fail("Invalid upload identity");
  }
  if (mediaType === "avatar") return `profiles/${uid}/${uploadId}.webp`;
  if (mediaType === "warung" && /^[A-Za-z0-9_-]{1,150}$/.test(resourceId)) return `warungs/${resourceId}/${slot}/${uploadId}.webp`;
  if (mediaType === "event" && /^[A-Za-z0-9_-]{1,150}$/.test(resourceId)) return `events/${resourceId}/${uploadId}.webp`;
  if (mediaType === "video" && /^[A-Za-z0-9_-]{1,150}$/.test(resourceId)) return `posts/${resourceId}/${uploadId}.mp4`;
  return fail("Unsupported media category");
}

export function firestoreDocumentPath(collection: string, id: string): string {
  if (!["profiles", "publicProfiles", "warungs", "posts"].includes(collection) ||
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
