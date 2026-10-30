import { assertRejects } from "jsr:@std/assert@1";
import { sanitizeImage } from "./image-validation.ts";

Deno.test("rejects forged image headers and corrupted image data", async () => {
  const forged = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
  await assertRejects(() => sanitizeImage(forged, "image/png"));
});

Deno.test("rejects MIME mismatch before image decoding", async () => {
  const notJpeg = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
  await assertRejects(() => sanitizeImage(notJpeg, "image/jpeg"));
});
