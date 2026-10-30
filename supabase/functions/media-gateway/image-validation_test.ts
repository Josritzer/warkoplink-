import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { Image } from "jsr:@matmen/imagescript@3.2.1";
import { sanitizeImage } from "./image-validation.ts";

Deno.test("decodes a valid PNG and normalizes it to WebP", async () => {
  const source = new Image(8, 6).fill(0x336699ff);
  const png = await source.encode();
  const result = await sanitizeImage(png, "image/png");
  assertEquals(result.contentType, "image/webp");
  assertEquals(result.width, 8);
  assertEquals(result.height, 6);
  assertEquals(String.fromCharCode(...result.bytes.slice(0, 4)), "RIFF");
  assertEquals(String.fromCharCode(...result.bytes.slice(8, 12)), "WEBP");
});

Deno.test("rejects forged image headers and corrupted image data", async () => {
  const forged = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
  await assertRejects(() => sanitizeImage(forged, "image/png"));
});

Deno.test("rejects MIME mismatch before image decoding", async () => {
  const notJpeg = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
  await assertRejects(() => sanitizeImage(notJpeg, "image/jpeg"));
});
