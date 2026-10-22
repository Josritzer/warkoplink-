# SL Community Platform

Aplikasi komunitas digital terpisah untuk profil anggota dan obrolan berbasis topik. Stack: React + Vite, Firebase Authentication, Cloud Firestore, GitHub, dan Netlify.

## Menjalankan secara lokal

1. Pasang Node.js LTS.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env` (konfigurasi web untuk proyek Firebase SL Community sudah diisi).
4. Pastikan **Email/Password** aktif di Firebase Console → Authentication → Sign-in method.
5. Pastikan Cloud Firestore Database sudah dibuat di proyek Firebase SL Community.
6. Terapkan aturan dari berkas `firestore.rules` pada Firebase Console → Firestore Database → Rules, lalu klik **Publish**. Jangan gunakan aturan contoh lain.
7. Jalankan `npm run dev`; untuk produksi jalankan `npm run build`.

## Variabel Firebase

Konfigurasi web pada `.env.example` ditujukan hanya untuk proyek `sl-community-platform`. Firebase Web API key dan app ID adalah konfigurasi client-side; jangan pernah menaruh service-account JSON, private key, atau kredensial Firebase Admin di frontend atau repository.

Untuk Netlify, masukkan variabel `VITE_FIREBASE_*` yang sama pada Site configuration → Environment variables sebelum deploy. Setelah mengubah environment variables, buat deploy baru agar konfigurasi masuk ke build.

## Struktur data Firestore

- `profiles/{uid}`: nama tampilan dan email pemilik akun; aturan membatasi pembacaan profil kepada pemiliknya.
- `posts/{postId}`: nama penulis, UID penulis, isi, topik, dan waktu publikasi. Membaca obrolan publik; hanya penulis yang dapat mengubah atau menghapus obrolannya.

## Netlify

Build command: `npm run build`  
Publish directory: `dist`

File `netlify.toml` sudah mengatur build dan fallback SPA. Masukkan variabel Firebase yang sama pada konfigurasi environment Netlify sebelum deploy.

**Pemisahan proyek:** gunakan hanya Firebase project khusus SL Community. Jangan gunakan kredensial, database, atau proyek produksi SL RELAX / Bookingpijat.com.
