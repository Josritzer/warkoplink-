export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MEDIA_TYPES = new Set(["avatar", "warung", "event"]);

export type MediaUploadRequest = {
  mediaType: "avatar" | "warung" | "event";
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
  if (typeof input.contentType !== "string" || !ALLOWED_IMAGE_TYPES.has(input.contentType)) {
    return fail("Unsupported image type");
  }
  if (typeof input.size !== "number" || !Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_IMAGE_BYTES) {
    return fail("Image size must be between 1 byte and 2 MiB");
  }
  const mediaType = input.mediaType as MediaUploadRequest["mediaType"];
  const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : "";
  if (mediaType !== "avatar" && (!resourceId || resourceId.length > 150 || resourceId.includes("/"))) {
    return fail("Invalid resource identifier");
  }
  if (mediaType === "avatar" && input.slot !== undefined) {
    return fail("Avatar does not accept a slot");
  }
  if (mediaType === "warung" && (!Number.isInteger(input.slot) || (input.slot as number) < 0 || (input.slot as number) > 4)) {
    return fail("Warkop photo slot must be between 0 and 4");
  }
  if (mediaType === "event" && input.slot !== undefined) {
    return fail("Event poster has one slot");
  }
  return {
    mediaType,
    ...(mediaType !== "avatar" ? { resourceId } : {}),
    ...(mediaType === "warung" ? { slot: input.slot as number } : {}),
    contentType: input.contentType,
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
  if (mediaType === "warung") return `warungs/${resourceId}/${slot}/${uploadId}.webp`;
  if (mediaType === "event") return `events/${resourceId}/${uploadId}.webp`;
  return fail("Unsupported media category");
}

export function firestoreDocumentPath(collection: string, id: string): string {
  if (!["profiles", "publicProfiles", "warungs", "posts"].includes(collection) ||
      !id || id.length > 150 || id.includes("/")) return fail("Invalid Firestore document path");
  return `${collection}/${id}`;
}
