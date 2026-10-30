import { decode, Image } from "jsr:@matmen/imagescript@3.2.1";
import { MAX_IMAGE_BYTES, validateImageBytes } from "./policy.ts";

const MAX_DIMENSION = 6000;
const MAX_PIXELS = 20_000_000;
const MAX_OUTPUT_BYTES = MAX_IMAGE_BYTES;

function readDimensions(bytes: Uint8Array, contentType: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (contentType === "image/png" && bytes.length >= 24) {
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }
  if (contentType === "image/jpeg") {
    const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 1 >= bytes.length) return null;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) return null;
      if (sof.has(marker)) {
        return {
          height: (bytes[offset + 3] << 8) | bytes[offset + 4],
          width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        };
      }
      offset += length;
    }
    return null;
  }
  if (contentType === "image/webp" && bytes.length >= 30) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X") {
      const read24 = (offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
      return { width: read24(24) + 1, height: read24(27) + 1 };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f && bytes.length >= 25) {
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      };
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return {
        width: ((bytes[26] | (bytes[27] << 8)) & 0x3fff),
        height: ((bytes[28] | (bytes[29] << 8)) & 0x3fff),
      };
    }
  }
  return null;
}

export type SanitizedImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  contentType: "image/webp";
};

export async function sanitizeImage(
  input: Uint8Array,
  declaredContentType: string,
): Promise<SanitizedImage> {
  if (!validateImageBytes(input, declaredContentType)) {
    throw new Error("Image signature does not match the declared type");
  }
  if (input.byteLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds 2 MiB");

  // Reject oversized pixel dimensions before decoding compressed image data.
  const dimensions = readDimensions(input, declaredContentType);
  if (!dimensions || !Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height) ||
      dimensions.width < 1 || dimensions.height < 1 ||
      dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION ||
      dimensions.width * dimensions.height > MAX_PIXELS) {
    throw new Error("Image dimensions exceed the safe limit");
  }

  const decoded = await decode(input);
  if (!(decoded instanceof Image)) throw new Error("Animated images are not supported");
  if (decoded.width !== dimensions.width || decoded.height !== dimensions.height) {
    throw new Error("Image dimensions do not match the encoded header");
  }

  // Decode and re-encode strips client metadata (including EXIF/GPS) and normalizes formats.
  const scale = Math.min(1, 2048 / decoded.width, 2048 / decoded.height);
  const normalized = scale < 1
    ? decoded.resize(Math.max(1, Math.round(decoded.width * scale)), Math.max(1, Math.round(decoded.height * scale)))
    : decoded;
  const sanitized = await normalized.encodeWebP();
  if (!(sanitized instanceof Uint8Array) || sanitized.length < 16 || sanitized.length > MAX_OUTPUT_BYTES) {
    throw new Error("Sanitized image exceeds the 2 MiB output limit");
  }
  if (!validateImageBytes(sanitized, "image/webp")) {
    throw new Error("Image encoder returned an invalid WebP");
  }
  return {
    bytes: sanitized,
    width: normalized.width,
    height: normalized.height,
    contentType: "image/webp",
  };
}
