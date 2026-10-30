const SUPABASE_URL = "https://klikvxuronunonymmiqv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_K3saFbvwwpNWfzF_i5jxow_lQiOXa4Q";
const MEDIA_GATEWAY_URL = `${SUPABASE_URL}/functions/v1/media-gateway`;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 502, 503, 504]);
const USER_FACING_UPLOAD_ERRORS = new Map([
  ["Invalid or expired Firebase ID token", "Sesi masuk kedaluwarsa. Keluar dari akun, masuk kembali, lalu coba lagi."],
  ["Firebase account is disabled or token revoked", "Sesi keamanan akun perlu diperbarui. Keluar dari akun, masuk kembali, lalu coba lagi."],
  ["Firebase account is disabled or status is unknown", "Sesi akun tidak dapat diverifikasi. Keluar dari akun, masuk kembali, lalu coba lagi. Jika masih gagal, hubungi admin."],
  ["Firebase ID token has been revoked", "Sesi keamanan akun sudah tidak berlaku. Keluar dari akun, masuk kembali, lalu coba lagi."],
  ["Firebase account lookup failed", "Status akun belum dapat diverifikasi. Periksa koneksi atau hubungi admin jika masalah berlanjut."],
  ["Firebase gateway is not configured", "Layanan foto belum siap. Silakan coba lagi nanti."],
  ["Firestore authorization lookup failed", "Izin akses data belum dapat diperiksa. Muat ulang halaman dan coba lagi."],
  ["Firebase Auth photo update failed", "Foto sudah diproses, tetapi profil belum berhasil diperbarui. Muat ulang halaman lalu coba lagi."],
  ["Firebase Auth photo removal failed", "Foto profil belum berhasil dihapus. Coba lagi beberapa saat."],
  ["Profile not found", "Data profil belum siap. Muat ulang halaman dan masuk kembali sebelum mengunggah."],
  ["profile-not-ready", "Data profil belum siap. Muat ulang halaman dan masuk kembali sebelum mengunggah."],
  ["Warkop ownership or status check failed", "Akun ini tidak dikenali sebagai pemilik pendaftaran warkop."],
  ["Warkop photo quota exceeded or slot is not sequential", "Maksimal lima foto. Lanjutkan unggahan yang tertunda sebelum memilih foto lain."],
  ["Too many pending uploads; finish or retry an existing upload", "Masih ada unggahan foto yang tertunda. Tekan tombol lanjutkan unggah foto terlebih dahulu."],
  ["Unsupported image type", "Format foto tidak didukung. Pilih JPG, PNG, atau WebP."],
  ["Image size must be between 1 byte and 2 MiB", "Ukuran foto harus lebih dari 0 dan maksimal 2 MiB."],
  ["Could not create signed upload", "Izin unggah foto belum bisa dibuat. Coba lagi sebentar."],
  ["Uploaded file not found; retry upload", "Foto belum sampai ke server. Tekan tombol lanjutkan unggah foto untuk mencoba lagi."],
  ["Could not publish validated image", "Server belum dapat memproses foto. Coba lagi sebentar."],
  ["Silakan masuk dan pilih foto terlebih dahulu.", "Silakan masuk dan pilih foto terlebih dahulu."],
  ["Pilih foto JPG, PNG, atau WebP.", "Pilih foto JPG, PNG, atau WebP."],
  ["Ukuran foto maksimal 2 MiB.", "Ukuran foto maksimal 2 MiB."],
]);

export function photoUploadErrorMessage(error, fallback = "Foto belum berhasil diunggah. Periksa koneksi atau coba lagi beberapa saat.") {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  if (!message) return fallback;
  return USER_FACING_UPLOAD_ERRORS.get(message) || fallback;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error?.retryable === false || attempt === attempts - 1) throw error;
      await wait(350 * (2 ** attempt));
    }
  }
  throw lastError;
}

async function gatewayRequest(user, payload) {
  const token = await user.getIdToken();
  const response = await fetch(MEDIA_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "Layanan foto belum dapat dihubungi.");
    error.status = response.status;
    error.retryable = RETRYABLE_HTTP_STATUSES.has(response.status) || response.status >= 500;
    throw error;
  }
  return body;
}

function signedUploadUrl(bucket, path, token) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}?token=${encodeURIComponent(token)}`;
}

/**
 * Uploads one profile avatar, warkop registration/gallery image, or event poster.
 * The server owns all resource authorization and final public URL assignment.
 */
export async function uploadWarkopMedia({ user, mediaType, resourceId, slot, file }) {
  if (!user?.getIdToken || !file) throw new Error("Silakan masuk dan pilih foto terlebih dahulu.");
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Pilih foto JPG, PNG, atau WebP.");
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Ukuran foto maksimal 2 MiB.");
  }
  const uploadId = crypto.randomUUID();
  const payload = {
    mediaType,
    ...(resourceId ? { resourceId } : {}),
    ...(mediaType === "warung" ? { slot } : {}),
    contentType: file.type,
    size: file.size,
    uploadId,
  };

  const initialized = await retry(() => gatewayRequest(user, { ...payload, action: "init" }));
  const upload = initialized.upload;
  if (!upload?.path || !upload?.token || !upload?.bucket || !upload?.signedUrl) throw new Error("Gateway tidak memberikan izin unggah yang valid.");

  let uploaded = false;
  try {
    await retry(async () => {
      const response = await fetch(new URL(upload.signedUrl, SUPABASE_URL).toString(), {
        method: "PUT",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": file.type,
          "x-upsert": "false",
        },
        body: file,
      });
      if (response.ok || response.status === 409) {
        uploaded = true;
        return;
      }
      const detail = await response.text().catch(() => "");
      const error = new Error(response.status === 413
        ? "Foto melebihi batas penyimpanan."
        : detail || "Unggahan terputus. Sistem akan mencoba kembali.");
      error.status = response.status;
      error.retryable = RETRYABLE_HTTP_STATUSES.has(response.status) || response.status >= 500;
      throw error;
    });
  } catch (error) {
    // A timeout may happen after the server stored the file; finalize is the safe recovery check.
    if (!uploaded) {
      if (error?.retryable === false) throw error;
      try {
        return (await gatewayRequest(user, { ...payload, action: "finalize" })).media;
      } catch {
        throw error;
      }
    }
  }

  return retry(async () => {
    const result = await gatewayRequest(user, { ...payload, action: "finalize" });
    if (!result.media?.url) throw new Error("Foto belum berhasil diproses.");
    return result.media;
  });
}

export async function removeWarkopAvatar(user) {
  if (!user?.getIdToken) throw new Error("Silakan masuk terlebih dahulu.");
  const result = await gatewayRequest(user, { action: "removeAvatar" });
  return result.media;
}
