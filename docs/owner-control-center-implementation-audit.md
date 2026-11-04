# Audit Implementasi WARKOPLINK Owner Control Center

Tanggal audit: 4 November 2026  
Repository: `Josritzer/warkoplink-`  
Branch dasar: `main`  
Commit dasar: `91804087e5e3c79be9630b9902a7cccdb0576931`  
Firebase project: `sl-community-platform`  
Supabase project: `klikvxuronunonymmiqv`

## 1. Ringkasan eksekutif

Owner Control Center belum tersedia sebagai satu pusat kendali. Komponen `src/AdminPanel.jsx` saat ini terutama menangani:
- verifikasi pendaftaran warkop berstatus `pending`;
- laporan obrolan dan status moderasinya;
- riwayat audit verifikasi dan moderasi;
- riwayat perubahan role (dibaca oleh jalur super-admin).

Aplikasi sudah memiliki fondasi produk yang luas: profil, direktori warkop, komunitas, grup tematik, posting, komentar, reaksi, pesan, notifikasi, RSVP acara, dan media. Sebagian besar masih berupa fitur anggota/publik, bukan pengelolaan platform oleh pemilik.

Keputusan blueprint tetap: satu pusat kendali pemilik platform. Audit ini tidak mengubah kode aplikasi, data, aturan keamanan, konfigurasi, billing, atau deployment.

## 2. Sumber dan batas audit

Diperiksa:
- source repository dan branch default;
- `src/App.jsx`, `src/AdminPanel.jsx`, `src/ReportModerationPanel.jsx`;
- `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`;
- package scripts dan workflow GitHub Actions;
- dokumen arsitektur Supabase di repository;
- project Supabase live melalui operasi baca saja: metadata project, tabel schema public, Edge Functions, bucket, object inventory, dan advisors.

Batasan:
- Koneksi Firebase live untuk membaca koleksi/dokumen, daftar pengguna Auth, dan konfigurasi Console/IAM tidak tersedia pada sesi audit ini. Karena itu jumlah anggota, jumlah warkop, isi data produksi, serta status akun aktual belum dapat dihitung.
- Inventory source/rules bukan pengganti inventory dokumen Firestore produksi.
- Tidak dilakukan upload, perubahan database, perubahan rules, deployment, atau penghapusan data.

## 3. Temuan teknis terverifikasi

### Repository dan build

- Branch default: `main`.
- Commit dasar audit: `91804087e5e3c79be9630b9902a7cccdb0576931`.
- Stack: React 18.3, Vite 6, Firebase JS SDK 12.
- Script tersedia: `npm run build`, `npm test`, dan `npm run test:rules`.
- CI memuat unit/component tests, build, Firestore Rules emulator tests, serta Supabase Edge Function tests/type-check.
- GitHub Actions run #151 pada commit dasar menyelesaikan job build dan deploy dengan status success. Workflow Hosting dijalankan setelah Community app CI sukses; deployment itu mencakup Firebase Hosting, Firestore Rules, dan indexes. Ini adalah status run yang sudah ada, bukan deployment yang dilakukan audit ini.
- Workflow `firebase-hosting.yml` dapat otomatis deploy setelah CI berhasil pada `main`. Karena itu seluruh pekerjaan baru harus berada di branch terpisah; jangan push ke `main`, merge, atau dispatch deploy tanpa instruksi pemilik.

### Panel dan otorisasi

- `src/AdminPanel.jsx` berisi verifikasi warkop, audit verifikasi, dan riwayat role.
- `src/ReportModerationPanel.jsx` menangani laporan posting, status `Baru/Ditinjau/Selesai`, serta audit.
- `src/App.jsx` saat ini membuka Panel Admin untuk `isPlatformStaff = isSuperAdmin || isModerator`.
- Firestore Rules menggunakan custom claims `platformRole == 'super_admin'` atau klaim kompatibilitas lama `admin == true` sebagai super-admin; moderator juga memiliki akses terbatas ke laporan.
- Ini belum selaras dengan blueprint owner-only. Perubahan otorisasi harus dirancang dan diuji di lapisan UI serta Firestore Rules; jangan sekadar menyembunyikan menu.
- Tidak ada file test khusus `AdminPanel.test.jsx` dalam inventory source. Sudah ada test khusus ReportModerationPanel dan test rules/role.

### Firestore source inventory

Koleksi/path yang teridentifikasi di rules:
- `publicProfiles/{uid}`
- `profiles/{uid}`
- `usernames/{username}`
- `communities/{communityId}/members/{uid}`
- `thematicGroups/{groupId}/members/{uid}`
- `thematicGroups/{groupId}/messages/{messageId}`
- `thematicGroups/{groupId}/reactions/{reactionId}`
- `posts/{postId}`
- `posts/{postId}/eventRsvps/{uid}`
- `posts/{postId}/likes/{uid}`
- `posts/{postId}/replies/{replyId}`
- `warungs/{warungId}`
- `warungs/{warungId}/followers/{uid}`
- `verificationAudit/{auditId}`
- `postReports/{reportId}`
- `postReportModeration/{reportId}`
- `postReportAudit/{auditId}`
- `platformRoles/{uid}`
- `platformRoleAudit/{eventId}`
- `userFollows/{followId}`
- `conversations/{conversationId}`
- `conversations/{conversationId}/messages/{messageId}`
- `notifications/{notificationId}`

Tujuh ID komunitas dan tujuh ID grup tematik telah dikunci dalam rules/katalog aplikasi. Keanggotaan komunitas dan grup dilakukan mandiri oleh anggota; tidak ditemukan struktur admin per grup pada rules.

Rules memisahkan profil privat dan publik. Laporan, audit, dan percakapan privat memiliki pembatasan akses. Owner Control Center harus menghormati privasi pesan; akses pemilik untuk membaca isi percakapan privat tidak boleh ditambahkan secara otomatis tanpa kebijakan dan alasan produk yang jelas.

Indeks saat ini mencakup feed berdasarkan komunitas, direktori warkop berdasarkan status verifikasi/nama, notifikasi penerima/waktu, dan daftar percakapan peserta/waktu.

### Storage Firebase dan Supabase

Firebase:
- `storage.rules` saat ini hanya mendefinisikan path avatar `profilePhotos/{uid}/avatar`.
- Baca avatar publik; create/update/delete dibatasi ke UID pemilik.
- Batas upload 2 MiB; MIME JPEG/PNG/WebP.

Supabase live:
- Project WarkopLink `klikvxuronunonymmiqv`, status `ACTIVE_HEALTHY`, region `eu-west-3`, PostgreSQL 17.
- Schema `public` belum memiliki tabel aplikasi; daftar migration database kosong.
- Edge Function `firebase-auth-check` aktif versi 3.
- Edge Function `media-gateway` aktif versi 6.
- Empat bucket terdaftar:
  - `warkoplink-media`: publik, maksimum 2 MiB, JPEG/PNG/WebP.
  - `warkoplink-quarantine`: privat, maksimum 2 MiB, JPEG/PNG/WebP.
  - `warkoplink-video`: publik, maksimum 50 MB, MP4.
  - `warkoplink-video-quarantine`: privat, maksimum 50 MB, MP4.
- Query baca `storage.objects` menemukan satu objek pada `warkoplink-media`, metadata ukuran sekitar 1,074,818 byte. Ini bukan ukuran total Firebase Storage atau tagihan layanan.
- Advisors Supabase security dan performance mengembalikan lint kosong pada saat audit.
- Gateway memeriksa token Firebase, status akun/revocation, kepemilikan resource, tipe/ukuran media, dan proses init/finalize/remove. Kebijakan video menerapkan tier berdasarkan jenis akun/keanggotaan; bucket maksimum 50 MB bukan berarti setiap anggota memperoleh batas 50 MB.
- `verify_jwt=false` pada metadata function, tetapi kode function melakukan verifikasi Firebase bearer token sendiri. Ini wajib dipertahankan dan diuji.

Dokumentasi media lama di repository menyebut gateway belum deployed dan video bukan cakupan aktif. Informasi tersebut sudah tidak sinkron dengan kondisi live Supabase dan source terbaru; dokumentasi perlu diperbarui setelah review.

## 4. Matriks 50 menu blueprint

Status:
- **Ada**: fitur anggota/publik atau mekanisme dasarnya sudah ada.
- **Parsial**: ada sebagian data/fungsi, tetapi belum menjadi modul owner.
- **Belum**: belum ditemukan implementasi owner yang mendukung menu.
- Status tidak menyatakan bahwa seluruh data live sudah diverifikasi.

| No. | Menu blueprint | Status saat ini | Catatan |
|---:|---|---|---|
| 1 | Dashboard Utama | Belum | Belum ada ringkasan owner dan KPI |
| 2 | Aktivitas Terbaru | Parsial | Audit verifikasi/laporan saja |
| 3 | Pusat Pemberitahuan | Parsial | Notifikasi anggota ada; inbox owner belum |
| 4 | Semua Anggota | Belum | Profil ada; daftar dan pencarian owner belum |
| 5 | Profil dan Akun | Parsial | Profil privat/publik tersedia |
| 6 | Aktivitas Anggota | Parsial | Aktivitas tersebar di posts/replies/follows/messages |
| 7 | Status Akun | Parsial | Auth gateway memeriksa disabled/revoked; kontrol owner belum |
| 8 | Direktori Warkop | Ada | Direktori publik tersedia |
| 9 | Pendaftaran Warkop | Ada | Form pendaftaran tersedia; owner hanya verifikasi pending |
| 10 | Profil Warkop | Ada | Profil dan data warkop tersedia |
| 11 | Kategori dan Fasilitas | Parsial | Field/katalog ada; editor taksonomi owner belum |
| 12 | Lokasi dan Peta | Ada | Leaflet/OSM dan koordinat tersedia |
| 13 | Pusat Komunitas | Parsial | Hub komunitas tersedia; kontrol owner belum |
| 14 | Tujuh Komunitas Utama | Ada | ID/katalog dan keanggotaan tersedia |
| 15 | Tujuh Grup Tematik | Ada | ID/katalog, pesan, reaksi, keanggotaan tersedia |
| 16 | Postingan | Parsial | Feed tersedia; pengelolaan global owner belum |
| 17 | Komentar dan Reaksi | Parsial | Reply/like/reaction tersedia; console owner belum |
| 18 | Percakapan dan Pesan | Parsial | Chat pribadi/grup tersedia; kebijakan akses owner perlu ditetapkan |
| 19 | Pusat Laporan | Parsial | Laporan posting dan moderasi tersedia |
| 20 | Konten yang Dilaporkan | Parsial | Preview post terkait tersedia; tipe laporan lain perlu dipetakan |
| 21 | Riwayat Penanganan | Ada | Audit verifikasi, report, dan role tersedia |
| 22 | Konten Dihapus/Disembunyikan | Belum | Belum ada lifecycle owner yang menyeluruh |
| 23 | Semua Acara | Parsial | Acara direpresentasikan sebagai post |
| 24 | Acara Warkop | Ada | Post bertipe Acara Warkop |
| 25 | Nobar dan Komunitas | Parsial | Topik/grup tersedia; console acara terpusat belum |
| 26 | Peserta dan RSVP | Ada | Subkoleksi eventRsvps tersedia |
| 27 | Kalender Aktivitas | Parsial | Perlu audit alur kalender/ICS di seluruh UI |
| 28 | Foto dan Gambar | Parsial | Avatar dan gateway gambar tersedia |
| 29 | Video | Ada | Gateway MP4 aktif; pengelolaan owner belum |
| 30 | Live Streaming | Belum | Tidak ditemukan fungsi live streaming |
| 31 | Penyimpanan Media | Parsial | Bucket/object ada; dashboard penggunaan belum |
| 32 | Pengaturan Batas Upload | Parsial | Limit ada di rules/gateway; editor owner belum |
| 33 | Pengumuman Global | Belum | Belum ditemukan modul broadcast global |
| 34 | Notifikasi Platform | Parsial | Notifikasi per pengguna tersedia |
| 35 | Pesan Informasi | Belum | Belum ditemukan pusat pesan informasi owner |
| 36 | Pemberitahuan Sistem | Belum | Belum ada dashboard alert sistem |
| 37 | Statistik Anggota | Belum | Belum ada analitik owner |
| 38 | Statistik Warkop | Belum | Belum ada analitik owner |
| 39 | Statistik Komunitas | Belum | Belum ada analitik owner |
| 40 | Statistik Konten | Belum | Belum ada analitik owner |
| 41 | Statistik Acara | Belum | Belum ada analitik owner |
| 42 | Statistik Media | Parsial | Storage object dapat dihitung; dashboard belum |
| 43 | Pertumbuhan dan Engagement | Belum | Definisi metrik dan agregasi belum |
| 44 | Identitas Platform | Parsial | Branding ada di source; pengaturan dinamis belum |
| 45 | Pengaturan Fitur | Belum | Feature control owner belum |
| 46 | Kategori dan Taksonomi | Parsial | Katalog hard-coded tersedia |
| 47 | Konfigurasi Sistem | Parsial | Konfigurasi deployment ada; console owner belum |
| 48 | Keamanan | Parsial | Rules, claims, audit, gateway tersedia; dashboard owner belum |
| 49 | Backup dan Pemulihan | Belum | Belum ditemukan alur owner dalam source |
| 50 | Kesehatan Sistem | Parsial | Status GitHub/Supabase dapat diperiksa; panel terpadu belum |

## 5. Risiko dan keputusan teknis

1. **Owner-only access:** UI saat ini menerima super-admin dan moderator. Rancangan harus menyisakan satu akses owner ke Owner Control Center. Perubahan klaim/rules wajib diuji dengan emulator dan skenario akun anggota.
2. **Privasi pesan:** jangan memberikan akses baca pesan privat kepada owner secara otomatis. Tentukan apakah panel hanya menampilkan metadata/indikator keamanan atau memiliki mekanisme akses terbatas yang sah.
3. **Data nyata:** hindari menghitung semua data dengan memuat seluruh dokumen ke browser. Tentukan strategi agregasi, pagination, indeks, dan biaya query.
4. **Media:** gunakan bucket dan gateway yang sudah ada. Jangan membuat bucket, mengaktifkan rekaman live, atau mengubah batas upload tanpa persetujuan biaya/risiko.
5. **Dokumentasi:** sinkronkan dokumen media lama dengan kondisi live.
6. **Auto-deploy:** workflow Hosting otomatis berjalan setelah CI sukses di main. Semua implementasi tetap di branch kerja; tidak merge/deploy tanpa instruksi.
7. **Firebase live inventory:** sebelum membuat KPI, perlu akses baca terkontrol ke project Firebase untuk memeriksa jumlah dokumen, struktur aktual, dan status Auth. Jangan menebak dari source code.

## 6. Urutan kerja setelah audit

### Tahap A — validasi data dan otorisasi
- Dapatkan inventory read-only Firebase Auth/Firestore/Storage dari project yang benar.
- Cocokkan dokumen aktual dengan source rules.
- Putuskan desain owner-only tanpa membuka akses publik.
- Tambahkan tes akses owner, moderator legacy, dan member biasa.

### Tahap B — fondasi panel
- Buat layout Owner Control Center desktop/mobile.
- Navigasi dan pencarian.
- Dashboard hanya dengan metrik yang sudah terverifikasi.
- Komponen tabel, filter, detail, pagination, loading/error/empty state.

### Tahap C — modul prioritas
- Anggota dan akun.
- Direktori dan pendaftaran warkop.
- Komunitas dan grup.
- Konten, laporan, dan acara.
- Media dan komunikasi.

### Tahap D — analitik, pengaturan, keamanan
- KPI dan tren.
- Pengumuman.
- Feature configuration.
- Health monitoring.
- Backup/recovery visibility.

### Tahap E — verifikasi rilis
- Unit/component tests.
- Firestore Rules emulator tests.
- Supabase Edge Function tests jika disentuh.
- Build.
- Review perubahan branch.
- Rilis hanya setelah instruksi pemilik.

## 7. Batas pelaksanaan

Audit ini hanya membaca repository, GitHub Actions, dan Supabase project WarkopLink. Tidak ada perubahan pada Firebase produksi, Supabase produksi, SULES/Bookingpijat, billing, secrets, data anggota, rules, atau deployment.
