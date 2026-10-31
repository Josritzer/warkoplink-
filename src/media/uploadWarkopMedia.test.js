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

  it("translates the exact disabled-account status returned by the gateway", () => {
    expect(photoUploadErrorMessage(new Error("Firebase account is disabled or status is unknown")))
      .toBe("Sesi akun tidak dapat diverifikasi. Keluar dari akun, masuk kembali, lalu coba lagi. Jika masih gagal, hubungi admin.");
  });

  it("guides users when Firebase confirms their account is disabled", () => {
    expect(photoUploadErrorMessage(new Error("Firebase account is disabled")))
      .toBe("Akun WarkopLink sedang dinonaktifkan. Hubungi admin untuk mengaktifkannya kembali.");
  });

  it("hides malformed Firebase account status details", () => {
    expect(photoUploadErrorMessage(new Error("Firebase account disabled status is invalid")))
      .toBe("Status akun tidak dapat dipastikan. Hubungi admin untuk pemeriksaan akun.");
  });

  it("explains revoked Firebase sessions without exposing backend details", () => {
    expect(photoUploadErrorMessage(new Error("Firebase ID token has been revoked")))
      .toBe("Sesi keamanan akun sudah tidak berlaku. Keluar dari akun, masuk kembali, lalu coba lagi.");
  });

  it("translates known Firestore authorization failures to safe Indonesian", () => {
    expect(photoUploadErrorMessage(new Error("Firestore authorization lookup failed")))
      .toBe("Izin akses data belum dapat diperiksa. Muat ulang halaman dan coba lagi.");
  });

  it("never exposes unfamiliar backend diagnostics to app users", () => {
    expect(photoUploadErrorMessage(new Error("Unexpected internal exception 0xdeadbeef")))
      .toBe("Foto belum berhasil diunggah. Periksa koneksi atau coba lagi beberapa saat.");
  });

  it("uses the context-specific fallback when an error has no message", () => {
    expect(photoUploadErrorMessage(
      new Error(),
      "Foto profil belum berhasil dihapus. Coba lagi beberapa saat."
    )).toBe("Foto profil belum berhasil dihapus. Coba lagi beberapa saat.");
  });
});
