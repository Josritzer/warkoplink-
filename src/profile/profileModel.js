export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(value) {
  return String(value ?? '').trim().replace(/^@/, '').toLowerCase();
}

export function validateProfileDraft(input = {}) {
  const displayName = String(input.displayName ?? '').trim();
  const username = normalizeUsername(input.username);
  const bio = String(input.bio ?? '').trim();
  const location = String(input.location ?? '').trim();
  const interests = Array.isArray(input.interests)
    ? [...new Set(input.interests.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))]
    : [];
  const socialLinks = input.socialLinks && typeof input.socialLinks === 'object'
    ? Object.fromEntries(['instagram', 'tiktok', 'facebook', 'website']
      .map(key => [key, String(input.socialLinks[key] ?? '').trim()])
      .filter(([, value]) => value))
    : {};

  if (displayName.length < 2 || displayName.length > 60) {
    return { ok: false, error: 'Nama tampilan harus 2–60 karakter.' };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: 'Username harus 3–20 karakter, hanya huruf kecil, angka, dan garis bawah.' };
  }
  if (bio.length > 160) return { ok: false, error: 'Bio maksimal 160 karakter.' };
  if (location.length > 80) return { ok: false, error: 'Lokasi maksimal 80 karakter.' };
  if (interests.length > 8 || interests.some(value => value.length > 32)) {
    return { ok: false, error: 'Pilih maksimal 8 minat, masing-masing maksimal 32 karakter.' };
  }
  for (const value of Object.values(socialLinks)) {
    if (value.length > 200) return { ok: false, error: 'Tautan media sosial terlalu panjang.' };
    if (!/^https:\/\//i.test(value)) return { ok: false, error: 'Tautan media sosial harus menggunakan HTTPS.' };
    try {
      const url = new URL(value);
      if (!url.hostname || url.username || url.password) throw new Error('invalid-url');
    } catch {
      return { ok: false, error: 'Periksa kembali tautan media sosial.' };
    }
  }
  return { ok: true, value: { displayName, username, bio, location, interests, socialLinks } };
}
