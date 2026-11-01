const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'support', 'moderator', 'warkoplink', 'help', 'root', 'null', 'undefined']);

export function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').toLocaleLowerCase('en-US');
}

export function validateProfileDraft(input = {}) {
  const displayName = String(input.displayName || '').trim();
  const username = normalizeUsername(input.username);
  const bio = String(input.bio || '').trim();
  const location = String(input.location || '').trim();

  if (displayName.length < 2 || displayName.length > 60) {
    return { ok: false, error: 'Nama tampilan harus 2–60 karakter.' };
  }
  if (username && (!/^[a-z0-9_]{3,20}$/.test(username) || RESERVED_USERNAMES.has(username))) {
    return { ok: false, error: 'Username harus 3–20 karakter, hanya huruf kecil, angka, atau garis bawah, dan bukan nama khusus.' };
  }
  if (bio.length > 160) return { ok: false, error: 'Bio maksimal 160 karakter.' };
  if (location.length > 80) return { ok: false, error: 'Lokasi maksimal 80 karakter.' };

  return { ok: true, value: { displayName, username, bio, location } };
}
