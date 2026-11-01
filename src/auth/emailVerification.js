import { reload, sendEmailVerification } from 'firebase/auth';

export async function sendAccountVerificationEmail(user) {
  if (!user) {
    const error = new Error('Tidak ada akun Firebase yang sedang login.');
    error.code = 'auth/no-current-user';
    throw error;
  }
  if (user.emailVerified) return false;
  await sendEmailVerification(user);
  return true;
}

export async function refreshAccountVerification(user) {
  if (!user) return false;
  await reload(user);
  return user.emailVerified === true;
}

export function emailVerificationErrorMessage(error) {
  const messages = {
    'auth/no-current-user': 'Sesi login tidak ditemukan. Silakan masuk kembali.',
    'auth/too-many-requests': 'Terlalu banyak permintaan email. Tunggu beberapa saat sebelum mencoba lagi.',
    'auth/network-request-failed': 'Koneksi internet bermasalah. Periksa jaringan lalu coba lagi.',
    'auth/invalid-email': 'Alamat email akun tidak valid. Periksa pengaturan akun Firebase.',
    'auth/user-disabled': 'Akun ini dinonaktifkan. Hubungi administrator WarkopLink.',
    'auth/requires-recent-login': 'Silakan keluar lalu masuk kembali sebelum mencoba lagi.'
  };
  return messages[error?.code] || 'Email verifikasi belum dapat diproses. Coba lagi beberapa saat kemudian.';
}
