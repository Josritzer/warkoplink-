const SUPABASE_URL = "https://klikvxuronunonymmiqv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_K3saFbvwwpNWfzF_i5jxow_lQiOXa4Q";
const MEDIA_GATEWAY_URL = `${SUPABASE_URL}/functions/v1/media-gateway`;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
      if (attempt < attempts - 1) await wait(350 * (2 ** attempt));
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
  if (!response.ok) throw new Error(body.error || "Layanan foto belum dapat dihubungi.");
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
  if (!upload?.path || !upload?.token || !upload?.bucket) throw new Error("Gateway tidak memberikan izin unggah yang valid.");

  let uploaded = false;
  try {
    await retry(async () => {
      const response = await fetch(signedUploadUrl(upload.bucket, upload.path, upload.token), {
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
      throw new Error(response.status === 413
        ? "Foto melebihi batas penyimpanan."
        : detail || "Unggahan terputus. Sistem akan mencoba kembali.");
    });
  } catch (error) {
    // A timeout may happen after the server stored the file; finalize is the safe recovery check.
    if (!uploaded) {
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
