// Logika murni (tanpa Firebase/React) agar mudah diuji dan konsisten dengan firestore.rules.

export const MAX_POST_LENGTH = 2000;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;
export const PASSWORD_MIN = 6;
export const FALLBACK_AUTHOR_NAME = 'Anggota';

// Harus sama persis dengan daftar kategori di firestore.rules.
export const POST_TOPICS = ['Obrolan Umum', 'Tanya Jawab', 'Info Layanan', 'Ide & Saran'];
export const FILTER_TOPICS = ['Semua', ...POST_TOPICS];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, error: 'Email wajib diisi.' };
  if (!EMAIL_PATTERN.test(value)) return { ok: false, error: 'Format email tidak valid.' };
  return { ok: true, value };
}

export function validatePassword(raw) {
  const value = String(raw ?? '');
  if (value.length < PASSWORD_MIN) {
    return { ok: false, error: `Kata sandi minimal ${PASSWORD_MIN} karakter.` };
  }
  return { ok: true, value };
}

export function validateDisplayName(raw) {
  const value = String(raw ?? '').trim();
  if (value.length < DISPLAY_NAME_MIN) {
    return { ok: false, error: `Nama tampilan minimal ${DISPLAY_NAME_MIN} karakter.` };
  }
  if (value.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Nama tampilan maksimal ${DISPLAY_NAME_MAX} karakter.` };
  }
  return { ok: true, value };
}

export function validatePostBody(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, error: 'Tulis pesan terlebih dahulu.' };
  if (value.length > MAX_POST_LENGTH) {
    return { ok: false, error: `Pesan maksimal ${MAX_POST_LENGTH} karakter.` };
  }
  return { ok: true, value };
}

export function validateTopic(topic) {
  return POST_TOPICS.includes(topic);
}

// Nama penulis tidak pernah memakai bagian dari email (menghindari kebocoran data pribadi).
export function authorNameFor(user) {
  const name = String(user?.displayName ?? '').trim();
  return validateDisplayName(name).ok ? name : FALLBACK_AUTHOR_NAME;
}

export function filterPosts(posts, topic, search) {
  const needle = String(search ?? '').trim().toLowerCase();
  return posts.filter((post) => {
    if (topic && topic !== 'Semua' && post.topic !== topic) return false;
    if (!needle) return true;
    return (
      String(post.body ?? '').toLowerCase().includes(needle) ||
      String(post.authorName ?? '').toLowerCase().includes(needle)
    );
  });
}

const AUTH_MESSAGES = {
  'auth/email-already-in-use': 'Email ini sudah terdaftar. Silakan masuk.',
  'auth/invalid-email': 'Format email tidak valid.',
  'auth/weak-password': `Kata sandi minimal ${PASSWORD_MIN} karakter.`,
  'auth/password-does-not-meet-requirements': 'Kata sandi belum memenuhi syarat keamanan.',
  'auth/invalid-credential': 'Email atau kata sandi salah.',
  'auth/user-not-found': 'Email atau kata sandi salah.',
  'auth/wrong-password': 'Email atau kata sandi salah.',
  'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
  'auth/network-request-failed': 'Koneksi internet bermasalah. Periksa jaringan Anda lalu coba lagi.',
  'auth/operation-not-allowed': 'Pendaftaran dengan email belum diaktifkan.',
};

export function authErrorMessage(error) {
  return AUTH_MESSAGES[error?.code] || 'Proses autentikasi gagal. Silakan coba lagi.';
}

export function postErrorMessage(error) {
  if (error?.code === 'permission-denied') {
    return 'Pesan ditolak oleh aturan keamanan. Pastikan Anda sudah masuk dan isi pesan sesuai ketentuan.';
  }
  if (error?.code === 'unavailable') {
    return 'Koneksi bermasalah. Pesan belum terkirim, silakan coba lagi.';
  }
  return 'Pesan belum terkirim. Silakan coba lagi.';
}
