import { afterEach, describe, expect, it, vi } from "vitest";
import { photoUploadErrorMessage, publishQuarantinedMenuPhoto, uploadWarkopMedia } from "./uploadWarkopMedia.js";

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


  it("requires parent and menu IDs for menu uploads", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadWarkopMedia({ user: { getIdToken: vi.fn() }, mediaType: "menu", file: { type: "image/jpeg", size: 1024 } }))
      .rejects.toThrow("Unggahan menu memerlukan identitas warkop dan menu.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends explicit menu IDs and accepts a private quarantined finalize result", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ upload: { path: "pending/menu-photo", token: "signed-token", bucket: "warkoplink-quarantine", signedUrl: "https://storage.example/upload" } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ media: { path: "menus/warung-1/menu-1/123e4567-e89b-12d3-a456-426614174000.webp", uploadId: "123e4567-e89b-12d3-a456-426614174000", quarantined: true, retryWhenPublished: true } }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-12d3-a456-426614174000" });
    const result = await uploadWarkopMedia({ user: { getIdToken: vi.fn().mockResolvedValue("firebase-id-token") }, mediaType: "menu", warungId: "warung-1", menuItemId: "menu-1", file: { type: "image/jpeg", size: 1024 } });
    expect(result).toMatchObject({ quarantined: true, retryWhenPublished: true, uploadId: "123e4567-e89b-12d3-a456-426614174000" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ action: "init", mediaType: "menu", warungId: "warung-1", menuItemId: "menu-1" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).action).toBe("finalize");
  });

  it("publishes only through the explicit quarantined-menu action", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ media: { url: "https://media.example/menu.webp" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const media = await publishQuarantinedMenuPhoto({ getIdToken: vi.fn().mockResolvedValue("firebase-id-token") }, "warung-1", "menu-1", "123e4567-e89b-12d3-a456-426614174000");
    expect(media.url).toBe("https://media.example/menu.webp");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ action: "publishMenuPhoto", warungId: "warung-1", menuItemId: "menu-1", uploadId: "123e4567-e89b-12d3-a456-426614174000" });
  });

  it("explains an expired Firebase session in Indonesian", () => {
    expect(photoUploadErrorMessage(new Error("Invalid or expired Firebase ID token")))
      .toBe("Sesi masuk kedaluwarsa. Keluar dari akun, masuk kembali, lalu coba lagi.");
  });

  it("translates the exact disabled-account status returned by the gateway", () => {
    expect(photoUploadErrorMessage(new Error("Firebase account is disabled or status is unknown")))
      .toBe("Sesi akun tidak dapat diverifikasi. Keluar dari akun, masuk kembali, lalu coba lagi. Jika masih gagal, hubungi admin.");
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

  it("accepts MP4 as the only feed-video format and validates the declared size", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: "Post not found" })
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-12d3-a456-426614174000" });
    await expect(uploadWarkopMedia({
      user: { getIdToken: vi.fn().mockResolvedValue("firebase-id-token") },
      mediaType: "video",
      resourceId: "post-1",
      file: { type: "video/quicktime", size: 1024 }
    })).rejects.toThrow("Format video belum didukung. Pilih MP4.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects feed videos larger than 50 MB before network upload", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadWarkopMedia({
      user: { getIdToken: vi.fn().mockResolvedValue("firebase-id-token") },
      mediaType: "video",
      resourceId: "post-1",
      file: { type: "video/mp4", size: 50_000_000 + 1 }
    })).rejects.toThrow("Ukuran video maksimal 50 MB.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
