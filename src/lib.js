// Logika murni (tanpa Firebase/React) agar mudah diuji dan konsisten dengan firestore.rules.

export const MAX_POST_LENGTH = 2000;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;
export const PASSWORD_MIN = 6;
export const FALLBACK_AUTHOR_NAME = 'Anggota';

// Jumlah obrolan terbaru yang didengarkan secara langsung (membatasi pembacaan Firestore).
export const POSTS_LIMIT = 100;
// Harus sama dengan jeda 10 detik di firestore.rules (postRateLimits).
export const POST_COOLDOWN_MS = 10000;
// Penghitung karakter diberi peringatan visual mulai dari sini.
export const POST_WARN_AT = 1800;

// Harus sama persis dengan daftar kategori di firestore.rules.
export const POST_TOPICS = ['Obrolan Umum', 'Tanya Jawab', 'Info Layanan', 'Ide & Saran'];
export const FILTER_TOPICS = ['Semua', ...POST_TOPICS];

// Harus sama persis dengan daftar alasan di firestore.rules (postReports).
export const REPORT_REASONS = [
  'Spam atau promosi berulang',
  'Pelecehan atau ujaran kebencian',
  'Informasi berbahaya atau menyesatkan',
  'Lainnya'
];
export const DEFAULT_REPORT_REASON = REPORT_REASONS[0];

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

export function validateReportReason(reason) {
  return REPORT_REASONS.includes(reason);
}

// Nama penulis tidak pernah memakai bagian dari email (menghindari kebocoran data pribadi).
export function authorNameFor(user) {
  const name = String(user?.displayName ?? '').trim();
  return validateDisplayName(name).ok ? name : FALLBACK_AUTHOR_NAME;
}

// Pencarian tidak membedakan huruf besar/kecil, aksen, maupun jumlah spasi.
export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('id')
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterPosts(posts, topic, search) {
  const needle = normalizeSearchText(search);
  return posts.filter((post) => {
    if (topic && topic !== 'Semua' && post.topic !== topic) return false;
    if (!needle) return true;
    return (
      normalizeSearchText(post.body).includes(needle) ||
      normalizeSearchText(post.authorName).includes(needle)
    );
  });
}

// Hanya penulis yang boleh menghapus obrolannya (sama dengan aturan delete di firestore.rules).
export function isOwnPost(post, user) {
  return Boolean(user?.uid && post?.authorId && post.authorId === user.uid);
}

// Menerima Firestore Timestamp, Date, atau angka milidetik; mengembalikan Date atau null.
export function toDateOrNull(value) {
  if (value == null) return null;
  try {
    const date = typeof value.toDate === 'function' ? value.toDate() : (value instanceof Date ? value : new Date(value));
    return Number.isNaN(date?.getTime?.()) ? null : date;
  } catch {
    return null;
  }
}

function safeLocaleString(date, options) {
  try {
    return date.toLocaleString('id-ID', options);
  } catch {
    return date.toISOString();
  }
}

// Waktu obrolan untuk ditampilkan. createdAt bernilai null selama pesan baru menunggu
// konfirmasi server (serverTimestamp), jadi dianggap "Baru saja". Field yang tidak ada
// (undefined) atau nilai tidak valid -> null (waktu tidak ditampilkan).
export function formatPostTime(value, now = Date.now()) {
  if (value === null) return { label: 'Baru saja', iso: '', title: 'Menunggu konfirmasi server' };
  const date = toDateOrNull(value);
  if (!date) return null;
  const seconds = Math.floor(Math.max(0, now - date.getTime()) / 1000);
  let label;
  if (seconds < 60) label = 'Baru saja';
  else if (seconds < 3600) label = `${Math.floor(seconds / 60)} menit lalu`;
  else if (seconds < 86400) label = `${Math.floor(seconds / 3600)} jam lalu`;
  else if (seconds < 7 * 86400) label = `${Math.floor(seconds / 86400)} hari lalu`;
  else label = safeLocaleString(date, { day: 'numeric', month: 'short', year: 'numeric' });
  return {
    label,
    iso: date.toISOString(),
    title: safeLocaleString(date, { dateStyle: 'medium', timeStyle: 'short' })
  };
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
    return 'Pesan ditolak oleh aturan keamanan. Tunggu 10 detik antar pesan dan pastikan isi pesan sesuai ketentuan.';
  }
  if (error?.code === 'unavailable') {
    return 'Koneksi bermasalah. Pesan belum terkirim, silakan coba lagi.';
  }
  return 'Pesan belum terkirim. Silakan coba lagi.';
}

export function reportErrorMessage(error) {
  if (error?.code === 'permission-denied') {
    return 'Laporan ditolak oleh aturan keamanan. Pastikan Anda sudah masuk.';
  }
  return 'Laporan belum berhasil dikirim. Periksa koneksi lalu coba lagi.';
}

export function deleteErrorMessage(error) {
  if (error?.code === 'permission-denied') {
    return 'Obrolan tidak dapat dihapus. Hanya penulis yang dapat menghapus obrolannya.';
  }
  if (error?.code === 'unavailable') {
    return 'Koneksi bermasalah. Obrolan belum dihapus, silakan coba lagi.';
  }
  return 'Obrolan belum berhasil dihapus. Periksa koneksi lalu coba lagi.';
}
