import { afterEach, describe, expect, it, vi } from "vitest";
import { photoUploadErrorMessage, uploadWarkopMedia } from "./uploadWarkopMedia.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unggah foto warkop", () => {
  it("does not repeat a permanent gateway error such as HTTP 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Profile not found" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-12d3-a456-426614174000" });

    await expect(uploadWarkopMedia({
      user: { getIdToken: vi.fn().mockResolvedValue("firebase-id-token") },
      mediaType: "avatar",
      file: { type: "image/jpeg", size: 1024 },
    })).rejects.toMatchObject({
      message: "Profile not found",
      status: 400,
      retryable: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe("init");
  });

  it("explains an expired Firebase session in Indonesian", () => {
    expect(photoUploadErrorMessage(new Error("Invalid or expired Firebase ID token")))
      .toBe("Sesi masuk kedaluwarsa. Keluar dari akun, masuk kembali, lalu coba lagi.");
  });

  it("keeps an unfamiliar diagnostic available without hiding the failure", () => {
    expect(photoUploadErrorMessage(new Error("Firestore authorization lookup failed")))
      .toBe("Foto belum berhasil diunggah. Detail: Firestore authorization lookup failed");
  });
});
