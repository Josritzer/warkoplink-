# SL Community Platform

Aplikasi komunitas digital terpisah untuk profil anggota dan obrolan berbasis topik. Stack: React + Vite, Firebase Authentication, Cloud Firestore, GitHub, dan Render.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Josritzer/sl-community-platform)

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

Untuk Render, variabel `VITE_FIREBASE_*` didefinisikan dalam `render.yaml`. Setelah layanan dibuat dari Blueprint, Render akan membangun situs dari branch `main`.

## Struktur data Firestore

- `profiles/{uid}`: nama tampilan dan email pemilik akun; aturan membatasi pembacaan profil kepada pemiliknya.
- `posts/{postId}`: nama penulis, UID penulis, isi, topik, dan waktu publikasi. Membaca obrolan publik; hanya penulis yang dapat mengubah atau menghapus obrolannya. Ini adalah koleksi obrolan resmi WarkopLink; lihat `docs/keputusan-skema-obrolan.md`.

## Render

Blueprint: `render.yaml`  
Build command: `npm ci && npm run build`  
Publish directory: `dist`  
Branch: `main`  
Deploy otomatis aktif untuk commit berikutnya setelah layanan dibuat.

**Pemisahan proyek:** gunakan hanya Firebase project khusus SL Community. Jangan gunakan kredensial, database, atau proyek produksi SL RELAX / Bookingpijat.com.
