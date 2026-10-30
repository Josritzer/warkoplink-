# WarkopLink — arsitektur media untuk penggunaan nyata

Status: keputusan arsitektur dan urutan kerja. Dokumen ini bukan izin mengubah produksi.

## Tujuan produk

WarkopLink adalah direktori warkop lokal dan ruang komunitas. Foto harus membantu pengunjung mengenali pemilik, menemukan tempat, dan memahami acara — bukan membuat aplikasi menjadi feed upload bebas yang mahal atau rawan spam.

Prinsip:
- Firebase Auth tetap menjadi identitas/login saat ini.
- Firestore tetap menjadi sumber data utama untuk profil, warkop, posting, komentar, reaksi, dan status verifikasi.
- Supabase dipakai untuk media baru hanya setelah keamanan dan biaya terbukti.
- Jangan memindahkan seluruh backend sekaligus.
- Pengalaman pengunjung harus tetap berjalan walau layanan media baru gagal.
- Foto publik memang dapat dilihat siapa pun; jangan pernah menaruh dokumen pribadi atau data sensitif di bucket publik.

## Temuan arsitektur dari source code

1. Frontend adalah React 18 + Vite; Firebase JS SDK 12 digunakan untuk Auth, Firestore, dan Storage.
2. Hosting saat ini adalah Firebase Hosting static build.
3. `firebase.json` mengonfigurasi Firestore rules dan Storage rules.
4. `storage.rules` saat ini mengizinkan baca publik untuk avatar, sedangkan tulis/hapus hanya oleh UID pemilik; batas file 2 MiB dan MIME JPEG/PNG/WebP.
5. Handler avatar memperbarui empat lokasi secara berurutan: objek Firebase Storage, Firebase Auth `photoURL`, `profiles.photoURL`, dan `publicProfiles.photoURL`.
6. `warungs/{id}` menyimpan `ownerUid` dan `photos[]` (maksimal lima menurut rules); profil warkop publik saat ini belum menampilkan galeri foto.
7. Acara saat ini adalah dokumen `posts/{postId}` dengan `postType: 'Acara Warkop'`; schema/rules belum mengizinkan poster.
8. `firebase-admin` sudah ada sebagai devDependency untuk pengujian/rules, tetapi itu tidak otomatis berarti SDK tersebut kompatibel untuk dijalankan di Supabase Edge Runtime (Deno).
9. Audit Supabase 30 Oktober 2026: project `klikvxuronunonymmiqv` berstatus ACTIVE_HEALTHY pada region `eu-west-3`; schema `public` belum memiliki tabel aplikasi; Edge Function `firebase-auth-check` aktif versi 2. Dua bucket awal kini telah dibuat: `warkoplink-quarantine` (private) dan `warkoplink-media` (public). PR #118 sedang menyiapkan `media-gateway`; function tersebut belum dideploy dan upload browser belum diaktifkan.

## Keputusan arsitektur

### Sumber kebenaran
- Identitas: Firebase Auth.
- Profil dan hak akses: dokumen Firestore privat/authoritative plus klaim admin yang sudah ada. `publicProfiles` hanya proyeksi publik, bukan sumber otorisasi.
- Data warkop: `warungs/{warungId}`; pemilik adalah `ownerUid`.
- Data acara: post yang sah dan penulisnya `authorId`.
- Media: objek storage; Firestore menyimpan URL/path dan metadata minimum, bukan file base64.

### Pemisahan media
Gunakan satu bucket media publik hanya untuk gambar yang memang dimaksudkan tampil ke publik:
- avatar publik;
- galeri warkop yang telah lolos verifikasi;
- poster acara yang dipublikasikan.

Jangan gunakan bucket ini untuk KTP, nomor telepon privat, bukti pembayaran, percakapan privat, atau lampiran sensitif. Media privat, jika kelak diperlukan, harus memakai bucket privat dan URL bertanda tangan dengan otorisasi terpisah.

### Jalur autentikasi dan upload
Jangan menganggap CORS atau validasi JWT JWKS sebagai otorisasi lengkap. Function `firebase-auth-check` versi 2 sudah di-deploy dan ACTIVE; ia melakukan verifikasi JWT dan lookup status akun Firebase (disabled/revoked), tetapi tetap hanya pemeriksa identitas read-only. Tes CI masih memakai mock, sehingga perilaku terhadap akun disabled/revoked dan pembatasan API key belum terbukti live. Function tidak boleh menerima perintah upload/delete atau dianggap sebagai pemeriksaan kepemilikan resource.

Sebelum memilih gateway, lakukan proof-of-compatibility yang membandingkan:
A. Supabase Edge Function (Deno) dengan mekanisme Firebase server-side yang secara resmi/teruji memeriksa token revocation dan akun disabled.
B. Backend Node tepercaya yang menjalankan Firebase Admin SDK dengan `verifyIdToken(token, true)`, ditempatkan pada hosting/runtime yang biayanya disetujui.
C. Tetap memakai Firebase Storage dengan Firebase Security Rules jika biaya/akses bucket yang sudah ada lebih aman dan ekonomis daripada menambah gateway.

Pilih satu jalur hanya setelah uji membuktikan token valid, expired, revoked, disabled, dan UID lintas akun. Jangan menulis endpoint upload sebelum pilihan ini terbukti. Jangan menaruh service-role key atau kredensial Admin di browser.

## Kontrak media dan batas operasional awal

- Format input: JPEG, PNG, WebP.
- Maksimum 2 MiB per file (server menghitung ukuran byte aktual).
- Server decode dan re-encode ke WebP; buang EXIF/GPS metadata.
- Tolak SVG, HTML, GIF/animasi, video, file korup, dan image decompression bomb.
- Object ID dibuat server; path tidak pernah menjadi bukti kepemilikan.
- Maksimum awal: 1 avatar aktif per akun, 5 foto per warkop, 1 poster per acara.
- Rate limit per UID dan resource; batas storage/egress dan indikator penggunaan harus dipantau.
- Gambar harus memiliki fallback UI, lazy loading, dimensi/aspect ratio stabil, dan alt text yang masuk akal.
- Hindari cache URL yang berubah setiap render; gunakan versi objek/updatedAt hanya saat foto berubah.

## Konsistensi lintas sistem

Perubahan objek Storage dan tiga referensi profil tidak berada dalam satu transaksi atomik. Implementasi harus memakai pola operasi yang dapat dipulihkan:
1. buat objek baru dengan ID baru;
2. validasi hasil dan simpan status operasi;
3. update Auth + Firestore references;
4. bila seluruh referensi sukses, tandai selesai;
5. bila gagal, jangan hapus foto lama; hapus objek baru atau tandai orphan untuk pembersihan;
6. sediakan retry yang idempotent dan audit tanpa token/PII.

Untuk penghapusan, jangan hapus objek lama sebelum referensi baru/kosong berhasil diterapkan. Terapkan soft-delete/retention sementara jika diperlukan untuk menghindari foto rusak saat operasi parsial.

## Urutan produk — bukan semua sekaligus

### Fase 0 — fondasi dan gerbang
- Konfirmasi inventory bucket Firebase yang sudah ada dan biaya/kuota aktual; jangan mengaktifkan billing.
- Gateway identitas sudah berjalan pada Supabase Edge Function; proof-of-compatibility untuk otorisasi resource dan upload masih harus dilakukan.
- Tambahkan tes kontrak dan uji keamanan lintas UID.
- Tetapkan budget/alert dan batas pemakaian.
- Bucket quarantine dan public media sudah dibuat; gateway masih di PR #118 draft, belum dideploy. Browser upload tetap belum aktif.

### Fase 1 — avatar
- Satu avatar per UID.
- Kompatibel dengan URL Firebase lama dan tampilan profil/post lama.
- Tidak menghapus atau migrasi massal foto lama.
- Uji update Auth + private/public profile dan recovery saat salah satu write gagal.
- Feature flag mematikan jalur baru jika terjadi masalah.

### Fase 2 — galeri warkop
- Upload hanya oleh `warungs/{id}.ownerUid` atau manajer yang eksplisit terdaftar.
- Hanya warkop verified yang dapat menampilkan foto ke publik; untuk status pending, simpan sebagai draft privat atau larang upload sampai verifikasi.
- Maksimum lima foto; pemilik dapat mengurutkan, mengganti, dan menghapus foto miliknya.
- Perbarui tampilan direktori dan profil warkop; gunakan gambar fallback jika kosong.
- Uji race condition jika pemilik berubah atau status verifikasi diturunkan.

### Fase 3 — poster acara
- Tambahkan field poster ke validasi Firestore dan semua tampilan/operasi acara secara bersamaan.
- Otorisasi berdasarkan `posts/{postId}.authorId` atau organizer yang didelegasikan secara eksplisit.
- Poster mengikuti siklus hidup post: edit, batal, hapus, moderasi, dan acara kedaluwarsa.
- Batasi satu poster; tidak ada album/unggahan bebas.

### Fase 4 — media komunitas tambahan (opsional)
- Jangan membangun feed foto/video bebas sebelum ada kebutuhan produk, moderasi, laporan, batas kuota, dan model biaya yang jelas.
- Video dan pesan privat tidak termasuk roadmap awal.

## Kriteria rilis

Rilis fase media hanya jika:
- tes unit dan rules hijau;
- integration test menguji akun valid, expired, revoked, disabled, cross-UID, ownership, ukuran, MIME spoofing, file korup, dan kegagalan parsial;
- gambar lama masih tampil;
- tidak ada regresi login, direktori, chat, post, atau acara;
- biaya/kuota sesuai batas yang disetujui;
- ada rollback/feature flag;
- ada bukti staging sebelum produksi.

## Guardrail produksi

Tidak ada bucket, secret, billing, deployment, migrasi data, atau perubahan rules produksi yang diotorisasi oleh dokumen ini. Tidak boleh menghapus koleksi `profiles` atau `posts`, mengubah data pengguna lama, atau menyentuh Bookingpijat.com / Sules.
