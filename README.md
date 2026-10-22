# SL Community Platform

Aplikasi komunitas digital terpisah untuk profil anggota dan obrolan berbasis topik. Stack: React + Vite, Firebase Authentication, Cloud Firestore, GitHub, dan Netlify.

## Menjalankan secara lokal

1. Pasang Node.js LTS.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env`, lalu isi konfigurasi Firebase Web App.
4. Aktifkan **Email/Password** di Firebase Console → Authentication → Sign-in method.
5. Buat Cloud Firestore Database untuk proyek Firebase SL Community.
6. Terapkan aturan dari berkas `firestore.rules` pada Firestore Rules.
7. Jalankan `npm run dev`; untuk produksi jalankan `npm run build`.

## Variabel Firebase

Ambil nilainya dari Firebase Console → Project settings → Your apps → Web app, kemudian isi variabel `VITE_FIREBASE_*` di `.env` atau Netlify Site configuration → Environment variables. Jangan commit file `.env`.

## Struktur data Firestore

- `profiles/{uid}`: nama tampilan dan email pemilik akun; aturan membatasi pembacaan profil kepada pemiliknya.
- `posts/{postId}`: nama penulis, UID penulis, isi, topik, dan waktu publikasi. Membaca obrolan publik; hanya penulis yang dapat mengubah atau menghapus obrolannya.

## Netlify

Build command: `npm run build`  
Publish directory: `dist`

File `netlify.toml` sudah mengatur build dan fallback SPA. Masukkan variabel Firebase yang sama pada konfigurasi environment Netlify sebelum deploy.

**Pemisahan proyek:** gunakan hanya Firebase project khusus SL Community. Jangan gunakan kredensial, database, atau proyek produksi SL RELAX / Bookingpijat.com.
