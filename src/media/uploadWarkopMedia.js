const SUPABASE_URL = "https://klikvxuronunonymmiqv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_K3saFbvwwpNWfzF_i5jxow_lQiOXa4Q";
const MEDIA_GATEWAY_URL = `${SUPABASE_URL}/functions/v1/media-gateway`;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50_000_000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4"]);

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
  ["Pendaftaran tidak dapat dilanjutkan.", "Pendaftaran ini belum dapat dilanjutkan. Pastikan Anda masuk dengan akun pemilik warkop."],
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
  ["Unsupported video type", "Format video belum didukung. Pilih MP4."],
  ["Video size must be between 1 byte and 50 MB", "Ukuran video harus lebih dari 0 dan maksimal 50 MB."],
  ["Video size exceeds the 25 MB member limit", "Ukuran video anggota maksimal 25 MB."],
  ["Video size exceeds the 50 MB warkop limit", "Ukuran video warkop maksimal 50 MB."],
  ["Invalid MP4 metadata or video dimensions exceed 1080p", "Video tidak valid atau resolusinya melebihi 1080p. Gunakan MP4 maksimal 1080p."],
  ["Could not publish validated video", "Server belum dapat memproses video. Coba lagi sebentar."],
  ["Video duration exceeds your 30-second limit", "Durasi video anggota maksimal 30 detik. Bergabunglah dengan salah satu grup tematik untuk batas 60 detik."],
  ["Video duration exceeds your 60-second limit", "Durasi video anggota grup maksimal 60 detik."],
  ["Video duration exceeds your 180-second limit", "Durasi video warkop terverifikasi maksimal 3 menit."],
  ["Unggahan video resumable belum dapat dimulai.", "Unggahan video belum dapat dimulai. Periksa koneksi lalu coba lagi."],
  ["Server tidak memberikan alamat unggah resumable.", "Izin unggah video belum diterima server. Coba lagi."],
  ["Potongan video belum berhasil dikirim.", "Koneksi video terputus. Sistem mencoba melanjutkan unggahan."],
  ["Posisi unggah video tidak valid.", "Status unggah video tidak valid. Coba unggah kembali."],
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


function encodeTusMetadata(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

async function uploadVideoResumable(file, upload, onProgress, signal) {
  const endpoint = "https://klikvxuronunonymmiqv.storage.supabase.co/storage/v1/upload/resumable/sign";
  const metadata = [
    ["bucketName", upload.bucket],
    ["objectName", upload.path],
    ["contentType", file.type],
    ["cacheControl", "31536000"]
  ].map(([key, value]) => `${key} ${encodeTusMetadata(value)}`).join(",");
  const created = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(file.size),
      "Upload-Metadata": metadata,
      "x-signature": upload.token
    },
    signal
  });
  if (created.status !== 201) throw new Error("Unggahan video resumable belum dapat dimulai.");
  const location = created.headers.get("Location");
  if (!location) throw new Error("Server tidak memberikan alamat unggah resumable.");
  const uploadUrl = new URL(location, endpoint).toString();
  const chunkSize = 6 * 1024 * 1024;
  let offset = 0;
  let attempts = 0;
  while (offset < file.size) {
    if (signal?.aborted) throw new DOMException("Upload dibatalkan", "AbortError");
    const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
    try {
      const response = await fetch(uploadUrl, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
          "x-signature": upload.token
        },
        body: chunk,
        signal
      });
      if (response.status !== 204) throw new Error("Potongan video belum berhasil dikirim.");
      const nextOffset = Number(response.headers.get("Upload-Offset"));
      if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > file.size) {
        throw new Error("Posisi unggah video tidak valid.");
      }
      offset = nextOffset;
      attempts = 0;
      onProgress?.(Math.min(100, Math.round(offset / file.size * 100)));
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") {
        await fetch(uploadUrl, { method: "DELETE", headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Tus-Resumable": "1.0.0", "x-signature": upload.token } }).catch(() => {});
        throw new DOMException("Upload dibatalkan", "AbortError");
      }
      if (++attempts > 3) throw error;
      const head = await fetch(uploadUrl, {
        method: "HEAD",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Tus-Resumable": "1.0.0", "x-signature": upload.token }
      });
      if (!head.ok) throw error;
      const serverOffset = Number(head.headers.get("Upload-Offset"));
      if (!Number.isSafeInteger(serverOffset) || serverOffset < 0 || serverOffset > file.size) throw error;
      offset = serverOffset;
      await wait(500 * attempts);
    }
  }
}

function signedUploadUrl(bucket, path, token) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}?token=${encodeURIComponent(token)}`;
}

/**
 * Uploads one profile avatar, warkop registration/gallery image, or event poster.
 * The server owns all resource authorization and final public URL assignment.
 */
export async function uploadWarkopMedia({ user, mediaType, resourceId, slot, file, onProgress, signal }) {
  if (!user?.getIdToken || !file) throw new Error("Silakan masuk dan pilih foto atau video terlebih dahulu.");
  const isVideo = mediaType === "video";
  if (isVideo ? !ALLOWED_VIDEO_TYPES.has(file.type) : !ALLOWED_TYPES.has(file.type)) {
    throw new Error(isVideo ? "Format video belum didukung. Pilih MP4." : "Pilih foto JPG, PNG, atau WebP.");
  }
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > maxBytes) {
    throw new Error(isVideo ? "Ukuran video maksimal 50 MB." : "Ukuran foto maksimal 2 MiB.");
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
    if (isVideo) {
      await uploadVideoResumable(file, upload, onProgress, signal);
      uploaded = true;
    } else {
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
        if (response.ok || response.status === 409) { uploaded = true; return; }
        const detail = await response.text().catch(() => "");
        const error = new Error(response.status === 413
          ? "Foto melebihi batas penyimpanan."
          : detail || "Unggahan terputus. Sistem akan mencoba kembali.");
        error.status = response.status;
        error.retryable = RETRYABLE_HTTP_STATUSES.has(response.status) || response.status >= 500;
        throw error;
      });
    }
  } catch (error) {
    if (!uploaded) {
      if (error?.name === "AbortError" || error?.retryable === false) throw error;
      try { return (await gatewayRequest(user, { ...payload, action: "finalize" })).media; }
      catch { throw error; }
    }
  }

  return retry(async () => {
    const result = await gatewayRequest(user, { ...payload, action: "finalize" });
    if (!result.media?.url) throw new Error(isVideo ? "Video belum berhasil diproses." : "Foto belum berhasil diproses.");
    return result.media;
  });
}

export async function removeWarkopAvatar(user) {
  if (!user?.getIdToken) throw new Error("Silakan masuk terlebih dahulu.");
  const result = await gatewayRequest(user, { action: "removeAvatar" });
  return result.media;
}

export async function removeWarkopPostVideo(user, postId) {
  if (!user?.getIdToken || !postId) throw new Error("Silakan masuk untuk menghapus video.");
  const result = await gatewayRequest(user, { action: "removeVideo", postId });
  return result.media;
}

export async function createVideoThumbnailDataUrl(file) {
  if (!file || typeof document === "undefined" || typeof URL.createObjectURL !== "function") return "";
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  return await new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
      resolve(value || "");
    };
    const timer = setTimeout(() => finish(""), 9000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) return finish("");
      try { video.currentTime = Math.min(1, video.duration / 3); } catch { finish(""); }
    };
    video.onerror = () => finish("");
    video.onseeked = () => {
      try {
        const width = Math.min(480, video.videoWidth);
        const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return finish("");
        context.drawImage(video, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob || blob.size > 110_000) return finish("");
          const reader = new FileReader();
          reader.onload = () => finish(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => finish("");
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.68);
      } catch { finish(""); }
    };
    video.src = objectUrl;
  });
}

