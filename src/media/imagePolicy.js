export const IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_WARUNG_PHOTOS = 5;

export function validateImageFile(file, { maxBytes = MAX_IMAGE_BYTES } = {}) {
  if (!file || !IMAGE_MIME_TYPES.includes(file.type)) return 'Pilih foto JPG, PNG, atau WebP.';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'File foto kosong atau tidak valid.';
  if (file.size > maxBytes) return 'Ukuran foto maksimal 2 MB.';
  return '';
}

export function validateImageFiles(files, { maxFiles = MAX_WARUNG_PHOTOS, maxBytes = MAX_IMAGE_BYTES } = {}) {
  const list = Array.from(files || []);
  if (list.length > maxFiles) return `Maksimal ${maxFiles} foto.`;
  for (const file of list) {
    const error = validateImageFile(file, { maxBytes });
    if (error) return error;
  }
  return '';
}
