import { decode, Image } from "jsr:@matmen/imagescript@3.2.1";
import { MAX_IMAGE_BYTES, validateImageBytes } from "./policy.ts";

const MAX_DIMENSION = 6000;
const MAX_PIXELS = 20_000_000;
const MAX_OUTPUT_BYTES = MAX_IMAGE_BYTES;

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

  // Strict decode rejects truncated/corrupt content; animations are not accepted.
  const decoded = await decode(input);
  if (!(decoded instanceof Image)) throw new Error("Animated images are not supported");

  const originalWidth = decoded.width;
  const originalHeight = decoded.height;
  if (!Number.isSafeInteger(originalWidth) || !Number.isSafeInteger(originalHeight) ||
      originalWidth < 1 || originalHeight < 1 ||
      originalWidth > MAX_DIMENSION || originalHeight > MAX_DIMENSION ||
      originalWidth * originalHeight > MAX_PIXELS) {
    throw new Error("Image dimensions exceed the safe limit");
  }

  // Decode and re-encode strips client metadata (including EXIF/GPS) and normalizes formats.
  decoded.contain(2048, 2048);
  const sanitized = await decoded.encodeWEBP(82);
  if (!(sanitized instanceof Uint8Array) || sanitized.length < 16 || sanitized.length > MAX_OUTPUT_BYTES) {
    throw new Error("Sanitized image exceeds the 2 MiB output limit");
  }
  if (!validateImageBytes(sanitized, "image/webp")) {
    throw new Error("Image encoder returned an invalid WebP");
  }
  return {
    bytes: sanitized,
    width: decoded.width,
    height: decoded.height,
    contentType: "image/webp",
  };
}
