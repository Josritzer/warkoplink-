// Logika murni (tanpa Firebase/React) agar mudah diuji dan konsisten dengan firestore.rules.

export const MAX_POST_LENGTH = 2000;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;
export const PASSWORD_MIN = 6;
export const FALLBACK_AUTHOR_NAME = 'Anggota';

// Kategori baru adalah satu-satunya kategori utama yang dapat dipublikasikan.
export const POST_TOPICS = ['Ngopi Bareng', 'Tanya Warkop', 'Info & Acara', 'Loker', 'Jual Beli & Jasa Lokal'];
export const FILTER_TOPICS = ['Semua', ...POST_TOPICS];
export const POST_SUBTYPES = {
  'Ngopi Bareng': ['Cari teman ngopi', 'Cari teman hobi', 'Ajakan kegiatan'],
  'Tanya Warkop': ['Wi-Fi & fasilitas', 'Rekomendasi warkop', 'Pertanyaan komunitas'],
  'Info & Acara': ['Info lokal', 'Acara komunitas', 'Promo warkop'],
  'Loker': ['Lowongan kerja', 'Cari pekerja', 'Paruh waktu / shift'],
  'Jual Beli & Jasa Lokal': ['Jual barang', 'Cari barang', 'Tawarkan jasa', 'Promosi usaha']
};
const LEGACY_TOPIC_MAP = {
  'Obrolan Umum': 'Ngopi Bareng',
  'Tanya Jawab': 'Tanya Warkop',
  'Info Layanan': 'Info & Acara',
  'Ide & Saran': 'Info & Acara'
};
export function canonicalTopic(topic) {
  return POST_TOPICS.includes(topic) ? topic : LEGACY_TOPIC_MAP[topic] || 'Ngopi Bareng';
}
export function displayTopic(topic) {
  return canonicalTopic(topic);
}

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

export function validatePostDetails(topic, details = {}) {
  if (!validateTopic(topic)) return { ok: false, error: 'Pilih salah satu dari lima kategori yang tersedia.' };
  const limits = { postType: 80, location: 160, eventDate: 40, price: 60, workType: 60, contact: 240 };
  for (const [key, max] of Object.entries(limits)) {
    if (String(details[key] ?? '').trim().length > max) return { ok: false, error: 'Detail posting terlalu panjang.' };
  }
  if (details.contact && !/^https:\/\//i.test(String(details.contact).trim()) && !/^@[\w.]{2,40}$/.test(String(details.contact).trim())) {
    return { ok: false, error: 'Kontak harus berupa tautan HTTPS atau nama akun @pengguna.' };
  }
  return { ok: true };
}

// Nama penulis tidak pernah memakai bagian dari email (menghindari kebocoran data pribadi).
export function authorNameFor(user) {
  const name = String(user?.displayName ?? '').trim();
  return validateDisplayName(name).ok ? name : FALLBACK_AUTHOR_NAME;
}

export function filterPosts(posts, topic, search) {
  const needle = String(search ?? '').trim().toLowerCase();
  return posts.filter((post) => {
    if (topic && topic !== 'Semua' && canonicalTopic(post.topic) !== topic) return false;
    if (!needle) return true;
    return (
      String(post.body ?? '').toLowerCase().includes(needle) ||
      String(post.authorName ?? '').toLowerCase().includes(needle) ||
      String(post.location ?? '').toLowerCase().includes(needle) ||
      String(post.postType ?? '').toLowerCase().includes(needle)
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
    return 'Pesan ditolak oleh aturan keamanan. Tunggu 10 detik antar pesan dan pastikan isi pesan sesuai ketentuan.';
  }
  if (error?.code === 'unavailable') {
    return 'Koneksi bermasalah. Pesan belum terkirim, silakan coba lagi.';
  }
  return 'Pesan belum terkirim. Silakan coba lagi.';
}


// Production feed guard: exclude only records explicitly marked as non-public.
// Do not infer test data from post text; questionable live records require owner review.
export function isPublicPost(post) {
  if (!post || typeof post !== 'object') return false;
  if (post.isTest === true || post.isDemo === true || post.isFixture === true || post.qa === true) return false;
  const visibility = String(post.visibility ?? post.publicationStatus ?? '').trim().toLowerCase();
  if (['draft', 'hidden', 'private', 'test', 'demo', 'staging', 'qa', 'fixture'].includes(visibility)) return false;
  const environment = String(post.environment ?? post.sourceEnvironment ?? '').trim().toLowerCase();
  return !['test', 'demo', 'staging', 'qa', 'fixture'].includes(environment);
}
