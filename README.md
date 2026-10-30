# WarkopLink

WarkopLink adalah platform komunitas dan direktori warkop lokal. Pengembangan dimulai dari Kabupaten Lamongan dengan fokus pada pencarian warkop, informasi usaha, obrolan komunitas, dan promosi kegiatan.

**Status:** masih dalam tahap pengembangan. Fitur, tampilan, dan alur operasional dapat berubah berdasarkan pengujian serta masukan pengguna.

## Aplikasi dan infrastruktur saat ini

- **Web/PWA:** React 18 + Vite.
- **Hosting:** Firebase Hosting — https://sl-community-platform.web.app/
- **Autentikasi:** Firebase Authentication.
- **Database aktif:** Cloud Firestore. Data profil, posting, balasan, reaksi, direktori warkop, dan moderasi tetap menggunakan sumber data yang sudah berjalan.
- **CI:** GitHub Actions menjalankan unit/component tests, production build, Firestore Rules tests, dan tes terisolasi untuk Firebase identity gateway.
- **Proyek Firebase:** `sl-community-platform`.
- **Proyek Supabase:** `WarkopLink` (Free), region `eu-west-3` (Paris); dipakai untuk Edge Function identitas dan gateway upload media (`media-gateway`), belum untuk database aplikasi.
- **Kode media (status per commit `e0c290e`):** `src/media/uploadWarkopMedia.js` sudah dipakai di form acara; `firestore.rules` sudah memvalidasi URL foto warkop dan poster acara dari bucket publik `warkoplink-media`; `media-gateway` punya tes Deno dan job deploy di CI. **Status deploy dan bucket di Supabase live belum diverifikasi ulang sejak audit 30 Oktober 2026** — verifikasi lewat dashboard/CLI sebelum mengandalkannya.
- **Supabase Edge Function:** `firebase-auth-check` aktif versi 2, `verify_jwt = false`; memverifikasi Firebase ID token dan melakukan `accounts:lookup` server-side untuk status akun/revocation.

Audit layanan 30 Oktober 2026 (data historis; kode sudah berkembang sesudahnya, lihat butir "Kode media" di atas): Supabase belum memiliki tabel aplikasi di schema `public` dan belum memiliki bucket Storage. Hanya fungsi `firebase-auth-check` yang aktif. Security dan performance advisors tidak mengembalikan temuan. Tes gateway CI memakai mock; pengujian terhadap akun Firebase live dan verifikasi pembatasan API key masih belum dilakukan. Fungsi ini hanya membuktikan identitas, bukan kepemilikan warkop atau izin upload/delete.

## Arsitektur yang dipertahankan

1. Firebase Auth tetap menjadi identitas/login pengguna.
2. Firestore tetap menjadi sumber kebenaran untuk profil, komunitas, direktori, kepemilikan warkop, dan status verifikasi.
3. Supabase Storage direncanakan untuk media baru setelah gateway, pemeriksaan kepemilikan, validasi file, pembatasan kuota, dan pengujian keamanan siap.
4. Tidak ada migrasi massal atau penghapusan data lama. URL foto lama harus tetap dapat ditampilkan selama transisi.
5. Tidak mengaktifkan Firebase Blaze, paket Supabase berbayar, bucket, secret, atau layanan berbayar lain tanpa persetujuan pemilik.

Rencana dan gerbang keamanan media dijelaskan di:
- `supabase/MEDIA_ARCHITECTURE_AND_ROADMAP.md`
- `supabase/STORAGE_GATEWAY_PLAN.md`
- `supabase/DATA_MODEL_IMAGE_OWNERSHIP_AUDIT.md`
- `supabase/FIREBASE_REVOCATION_RUNTIME_DECISION.md`

## Batas media tahap awal

Jenis media yang direncanakan hanya:
- Foto profil.
- Foto pendaftaran/galeri warkop.
- Poster acara warkop.

Rancangan awal membatasi gambar ke JPEG, PNG, atau WebP, maksimal 2 MiB per file, dengan validasi server-side dan penghapusan metadata EXIF/GPS. **Kode upload sudah ada di repo, tetapi keberadaannya di kode bukan bukti bahwa gateway live berfungsi; uji end-to-end di lingkungan nyata masih diperlukan.** Jangan menaruh kredensial Admin atau service-role key di frontend.

## Menjalankan secara lokal

1. Pasang Node.js 20 atau versi LTS yang kompatibel.
2. Jalankan `npm ci`.
3. Salin `.env.example` menjadi `.env` untuk konfigurasi Firebase Web.
4. Jalankan `npm run dev`.
5. Jalankan `npm test` untuk unit/component tests dan `npm run build` untuk build produksi.

Tes Firestore Rules menggunakan emulator melalui workflow CI. Tes Firebase identity gateway berjalan terpisah dengan Deno dan mock. Function sudah ter-deploy, tetapi tes mock bukan bukti bahwa pemeriksaan akun disabled/revoked berhasil terhadap Firebase live.

## Deployment

Perubahan aplikasi pada branch `main` dapat memicu workflow Firebase Hosting setelah merge. Workflow saat ini menerbitkan Hosting saja untuk perubahan biasa; Firestore Rules/Indexes hanya diterbitkan jika file sumber terkait berubah. Firebase Storage Rules sengaja tidak diterbitkan oleh workflow.

Jangan melakukan perubahan produksi manual, mengaktifkan billing, mengubah secret, atau memigrasikan data tanpa persetujuan pemilik.

## Batas proyek

Repository dan infrastruktur ini khusus WarkopLink. **Jangan mengubah Bookingpijat.com, Sules/SL Relax, atau proyek produksi lain.** Jangan menghapus koleksi `profiles` atau `posts`, jangan menghapus data pengguna, dan jangan menonaktifkan tes yang gagal.
