# Rancangan Migrasi Foto Profil ke Supabase Storage

Status: rancangan teknis saja — belum diimplementasikan dan belum diaktifkan.

## 1. Kondisi aktual yang diaudit

Handler foto profil saat ini berada di `src/App.jsx`:

1. Memastikan dokumen `profiles/{uid}` tersedia melalui `ensureProfile()`.
2. Mengunggah file ke Firebase Storage pada `profilePhotos/{uid}/avatar`.
3. Mengambil Firebase download URL.
4. Memperbarui Firebase Auth `photoURL`.
5. Memperbarui `profiles/{uid}.photoURL`.
6. Memperbarui `publicProfiles/{uid}.photoURL`.

Hapus foto melakukan operasi kebalikan: menghapus objek Firebase Storage lalu mengosongkan tiga referensi profil. Validasi klien sekarang menerima JPEG/PNG/WebP dan membatasi ukuran file hingga 2 MiB. Validasi klien bukan batas keamanan; server harus memvalidasi ulang.

## 2. Keputusan kompatibilitas

- Jangan menghapus, memindahkan massal, atau mengubah URL foto Firebase yang sudah tersimpan.
- Jangan mengubah struktur dokumen `profiles` dan `publicProfiles`.
- Pertahankan field `photoURL` sebagai URL yang dapat dibaca UI lama.
- Foto Firebase yang sudah ada tetap menjadi fallback sampai foto Supabase berhasil disimpan dan seluruh referensi profil berhasil diperbarui.
- Jangan menghapus objek lama secara otomatis saat migrasi. Pembersihan lama adalah pekerjaan terpisah setelah periode stabil dan audit referensi.

## 3. Alur yang direkomendasikan

### Upload baru

1. Klien meminta token Firebase ID terbaru dari sesi aktif.
2. Klien mengirim file dan token ke endpoint gateway tepercaya.
3. Gateway memvalidasi identitas Firebase secara server-side, termasuk status akun dan pencabutan token. Verifikasi tanda tangan JWT/JWKS saja tidak cukup untuk keputusan tulis yang sensitif.
4. Gateway mengambil UID dari token yang sudah diverifikasi. UID/path tidak boleh dipercaya dari parameter klien.
5. Gateway membatasi ukuran aktual maksimum 2 MiB, memeriksa signature/magic bytes dan mendekode gambar. Jangan percaya ekstensi atau Content-Type yang dikirim browser.
6. Gateway mengubah gambar menjadi WebP, menghapus metadata EXIF, lalu membuat nama objek acak yang ditentukan server di jalur `profiles/{uid}/...`.
7. Gateway menyimpan objek dan mengembalikan URL/identitas objek yang sah.
8. Aplikasi memperbarui Firebase Auth `photoURL`, `profiles/{uid}.photoURL`, dan `publicProfiles/{uid}.photoURL` memakai aturan pemilik yang sudah ada.
9. Jika pembaruan referensi profil gagal, aplikasi/gateway harus melakukan kompensasi: hapus objek baru atau tandai sebagai orphan untuk pembersihan aman; jangan menghapus foto lama. Tampilkan kegagalan, bukan sukses palsu.
10. Setelah semua referensi berhasil, UI memperbarui sesi dan cache foto.

### Hapus foto

1. Gateway memverifikasi token Firebase dan mengambil UID dari token.
2. Gateway hanya menghapus objek avatar milik UID tersebut; klien tidak boleh mengirim path arbitrer.
3. Setelah penghapusan berhasil, referensi Auth dan dua dokumen profil dikosongkan. Jika pembaruan referensi gagal, gunakan status operasi/kompensasi agar UI tidak menganggap foto sudah terhapus sepenuhnya.
4. Jangan menghapus foto Firebase lama yang mungkin masih dipakai sebagai fallback tanpa pemeriksaan referensi.

## 4. Pilihan otorisasi — belum diputuskan untuk implementasi

Source function `firebase-auth-check` sekarang memeriksa tanda tangan, issuer, audience, klaim waktu, lalu melakukan lookup status akun Firebase untuk memeriksa UID, akun dinonaktifkan, dan pencabutan token. Namun integrasi live belum diuji dan function tetap hanya pemeriksa identitas read-only; **belum boleh dijadikan otorisasi upload/hapus**.

Sebelum gateway tulis dibuat, pilih dan uji runtime server-side yang dapat memvalidasi Firebase ID token dengan pemeriksaan revocation/disabled-account. Implementasi Firebase Admin SDK membutuhkan lingkungan Node yang kompatibel dan kredensial server yang disimpan sebagai secret; jangan mengasumsikan paket Admin SDK otomatis kompatibel dengan Deno Edge Runtime. Lakukan proof-of-compatibility terlebih dahulu.

Tidak boleh:
- menaruh service-role key Supabase atau kredensial Firebase Admin di frontend;
- mempercayai UID, object path, MIME, atau ukuran dari klien tanpa validasi server;
- membuat bucket atau secret produksi sebelum persetujuan dan desain final;
- membuka upload publik tanpa rate limit, kuota, dan kontrol abuse.

## 5. Tahapan implementasi setelah gerbang keamanan terpenuhi

1. Proof-of-compatibility: validasi token valid, kedaluwarsa, dicabut, dan akun dinonaktifkan pada runtime terpilih.
2. Unit test untuk format, magic bytes, ukuran, decode/re-encode, UID/path isolation, CORS, rate limit, dan error handling.
3. Bangun endpoint upload avatar dengan bucket/prefix privat atau strategi public-read yang disetujui; jangan mengaktifkan klien lebih dulu.
4. Uji upload/hapus dan kegagalan parsial pada proyek non-produksi.
5. Tambahkan mekanisme kompensasi dan observabilitas tanpa mencatat token atau data sensitif.
6. Aktifkan bertahap setelah seluruh CI dan uji integrasi hijau.
7. Pertahankan pembacaan URL lama dan fallback Firebase selama masa transisi.

## 6. Gerbang yang masih terbuka

- Belum ada bucket Supabase.
- Belum ada secret Firebase Admin atau Supabase service-role.
- Belum ada endpoint upload/hapus.
- Belum ada token revocation/disabled-account check yang terbukti berjalan.
- Belum ada integrasi uji upload nyata.
- Belum ada perubahan Firebase Auth, Firestore, Storage, atau situs live.

## 7. Batas perubahan

Rancangan ini tidak mengubah data, aturan Firestore, Firebase Storage, bucket Supabase, konfigurasi produksi, billing, atau hosting. Implementasi hanya boleh dimulai setelah runtime verifikasi identitas dan alur sinkronisasi/kompensasi terbukti aman.
