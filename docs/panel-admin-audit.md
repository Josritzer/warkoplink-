# Panel Admin dan Audit Verifikasi WarkopLink

Tahap ini menggunakan Firebase Spark. Tidak memerlukan Cloud Functions, server baru, atau upgrade ke Blaze.

## Hak admin

Panel hanya ditampilkan bila token Firebase Authentication memiliki custom claim `admin: true`. UI bukan batas keamanan; Firestore Rules memeriksa klaim tersebut pada setiap operasi. Jangan memakai email atau field profil sebagai sumber hak admin.

### Bootstrap admin satu kali dari lingkungan tepercaya

1. Pastikan UID akun admin yang benar dari Firebase Authentication Console untuk proyek **sl-community-platform**.
2. Pada komputer tepercaya dengan Node.js dan Google Cloud CLI, login menggunakan akun pemilik/operator yang memiliki izin mengelola Firebase Authentication:
   ```sh
   gcloud auth application-default login
   ```
3. Dari salinan repo ini, jalankan:
   ```sh
   npm install
   node scripts/grant-admin.mjs FIREBASE_AUTH_UID
   ```
   Ganti `FIREBASE_AUTH_UID` dengan UID akun admin, tanpa tanda kurung. Jangan kirim UID atau kredensial ke chat/log publik.
4. Pengguna harus keluar lalu masuk kembali agar token baru memuat klaim admin.
5. Jangan menjalankan skrip dari perangkat/akun yang tidak tepercaya. Skrip menargetkan proyek WarkopLink `sl-community-platform`; jangan menaruh kredensial dalam repo atau frontend.

Skrip tidak membuat service account key dan tidak mengaktifkan layanan berbayar. Jika kredensial lokal atau izin IAM belum tersedia, berhenti dan minta pemilik proyek menyiapkannya secara aman.

## Alur panel

- Panel mengambil paling banyak 50 pendaftaran berstatus `pending`.
- Admin memeriksa informasi lalu memilih **Setujui** atau **Tolak**. Penolakan mewajibkan alasan; alasan dibatasi 500 karakter.
- Status warkop dan dokumen `verificationAudit` ditulis dalam satu Firestore batch.
- Firestore Rules mensyaratkan catatan audit cocok dengan perubahan status pada batch yang sama. Jika salah satu operasi ditolak, seluruh batch gagal.
- Audit memuat ID/nama warkop, status sebelumnya dan sesudahnya, UID admin, alasan, dan waktu server. Hanya admin dapat membaca audit; catatan tidak dapat diedit atau dihapus melalui klien.
- Panel menampilkan maksimal 50 catatan audit terbaru.

## Batasan

- Ini bukan pengganti backup atau log audit administratif Firebase. Pemilik proyek tetap harus membatasi akses Console/IAM.
- Klaim admin hanya boleh diberikan kepada operator tepercaya. Jangan membuat UI untuk mengangkat akun menjadi admin.
- Tes emulator menggunakan proyek demo dan tidak mengubah data proyek Firebase nyata.
- Tidak ada perubahan pada koleksi `profiles` atau `posts`, dan tidak ada perubahan pada SL RELAX / Bookingpijat.com.
