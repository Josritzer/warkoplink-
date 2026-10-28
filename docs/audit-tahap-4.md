# Audit Tahap 4 WarkopLink: Aturan Firestore dan Performa

Tanggal: 28 Oktober 2026 · Basis: cabang `main`, commit `be12d92`

## Cara membaca laporan ini

- Audit dilakukan dengan **membaca kode** (`firestore.rules`, `storage.rules`, `src/`, `tests/`, workflow GitHub).
- **Tes dan build belum dijalankan** karena instalasi paket npm diblokir kebijakan jaringan sesi audit. Temuan aturan di bawah belum dibuktikan dengan emulator; setiap temuan menyebut tes yang perlu ditulis.
- Tidak ada perubahan skema. Semua usulan sesuai keputusan: koleksi `posts` tetap, field baru hanya opsional, field lama tidak diubah.
- Tingkat: **Tinggi** = memengaruhi kuota/biaya atau keamanan data; **Sedang** = perlu diputuskan; **Rendah** = rapikan.

## Ringkasan

| # | Temuan | Tingkat | Perlu keputusan? |
|---|--------|---------|------------------|
| P1 | Pemantau reaksi dipasang ulang untuk semua postingan setiap daftar postingan berubah | Tinggi | Tidak |
| P2 | Hitung balasan dijalankan ulang untuk semua postingan pada pemicu yang sama | Sedang | Tidak |
| P3 | Hapus postingan membaca seluruh isi `likes` dan `replies` tanpa batas | Sedang | Tidak |
| S1 | Penghitung reaksi bisa diisi angka palsu saat postingan dibuat | Tinggi | Tidak |
| S2 | Pendaftaran warkop tanpa batas per akun dan isi daftar tidak divalidasi | Sedang | Ya |
| S3 | Warkop yang sudah verified bisa diubah nama, alamat, dan lokasinya tanpa verifikasi ulang | Sedang | Ya |
| C1 | Deploy produksi (hosting + aturan) tidak menunggu tes | Tinggi | Tidak |
| U1 | Pencarian warkop hanya menyaring data yang sudah dimuat (30 per halaman) | Sedang | Ya |
| S4 | Tidak ada pembatasan frekuensi posting dan balasan | Rendah | Ya |
| S5 | Dokumen `likes` terbaca publik (UID dan emoji) | Rendah | Ya |
| R1 | Rapikan kecil: `npm ci` di CI, file indeks, edit setelah `deleting` | Rendah | Tidak |

## Performa

### P1. Pemantau reaksi dipasang ulang terlalu sering (Tinggi)

Di `src/App.jsx` (efek mulai baris 391), setiap postingan di layar punya satu `onSnapshot` ke seluruh subkoleksi `likes`. Efek ini bergantung pada `allPosts`, yang dibuat ulang setiap kali daftar postingan berubah: postingan baru, reaksi pada salah satu dari 10 postingan, atau "muat lebih banyak". Setiap perubahan itu melepas semua pemantau dan memasangnya lagi, sehingga seluruh dokumen `likes` kemungkinan besar terbaca ulang dan ditagih sebagai pembacaan. Pada paket Spark kuota pembacaan harian terbatas, dan biaya naik seiring jumlah reaksi dikali jumlah postingan.

Penghitung reaksi sebenarnya sudah ada di dokumen postingan (`reactions`, `totalReactions`), dan sudah ikut terbaca lewat daftar postingan.

Usulan (tanpa perubahan skema):
- Ambil jumlah dan rincian reaksi dari dokumen postingan, bukan dari `likes`.
- Untuk reaksi milik pengguna sendiri, baca hanya dokumen `likes/{uid}` per postingan (satu dokumen, bukan semua).
- Pasang pemantau berdasarkan **daftar ID postingan**, bukan identitas array, agar tidak dipasang ulang kalau ID-nya sama.
- Postingan lama tanpa agregat tetap ditangani skrip `scripts/backfill-reaction-aggregates.mjs`; periksa dulu bahwa semua postingan produksi sudah terisi.

Tes: komponen (`App.test.jsx`) yang memastikan jumlah pemantau tidak bertambah saat satu postingan berubah.

### P2. Hitung balasan dijalankan ulang (Sedang)

Efek berikutnya (baris 415) memanggil `getCountFromServer` untuk setiap postingan, dengan pemicu `allPosts` yang sama dengan P1. Setiap pemanggilan menimbulkan sedikitnya satu pembacaan.

Usulan: picu hanya saat himpunan ID postingan berubah. Jangka panjang bisa disimpan `replyCount` di dokumen postingan, tetapi itu perlu aturan baru (mirip `validReactionAggregateUpdate`) dan tes; tunda sampai perlu.

### P3. Hapus postingan membaca semuanya berulang (Sedang)

`src/services/postService.js`: `getDocs(childRef)` mengambil **seluruh** isi `likes` atau `replies`, lalu hanya 450 dokumen dihapus per putaran. Dengan ribuan dokumen, putaran berikutnya mengunduh ulang sisanya.

Usulan: tambahkan `query(childRef, limit(DELETE_BATCH_SIZE))`. Tes aturan juga perlu menghapus batch besar (450 `likes`) karena aturan `likes` memanggil `get()` ke dokumen postingan pada setiap penghapusan; batas panggilan akses dokumen per permintaan belum diuji di `tests/rules/post-delete.test.js`.

### U1. Pencarian warkop (Sedang)

`App.jsx` (sekitar baris 192) menyaring di sisi klien hanya data yang sudah dimuat (30 per halaman). Warkop ke-31 dan seterusnya tidak muncul sampai "muat lebih banyak" ditekan. Untuk uji lapangan di Lamongan ini bisa membuat pengguna mengira warkop belum terdaftar.

Usulan: pencarian awalan lewat `nameNormalized` (`>=` dan `<=` pada query), yang membutuhkan indeks komposit `verificationStatus` + `nameNormalized`. Simpan di `firestore.indexes.json` dan deploy indeksnya.

### Indeks

Query saat ini hanya memakai satu kesetaraan atau satu `orderBy`, sehingga **tidak membutuhkan indeks komposit**. Tidak ada `firestore.indexes.json` di repo; buat saat query berikutnya (U1, S2) menambah `orderBy` bersama `where`.

## Aturan Firestore

### S1. Penghitung reaksi bisa dipalsukan saat membuat postingan (Tinggi)

`validPost` hanya memeriksa bahwa setiap hitungan bilangan tak negatif dan `totalReactions` sama dengan jumlahnya. Aturan **tidak mewajibkan semuanya nol**. Dari pembacaan aturan, pengguna bisa membuat postingan dengan `reactions.like = 999` dan `totalReactions = 999`. Tes saat ini hanya menguji manipulasi pada postingan yang sudah ada (menolak angka 99 tanpa dokumen `likes`), tidak menguji pembuatan dengan angka tidak nol.

Usulan: pada `validPost`, wajibkan semua hitungan reaksi `== 0` dan `totalReactions == 0`. Ini pengetatan, tidak mengubah skema; klien memang selalu mengirim nol. Tes: pembuatan dengan angka tidak nol harus gagal.

### S2. Pendaftaran warkop rawan dibanjiri (Sedang, perlu keputusan)

`validWarung` tidak membatasi jumlah pendaftaran per akun, dan isi `facilities`, `photos`, serta `openingHours` hanya diperiksa ukuran daftarnya, bukan tipe dan panjang tiap elemen. Panel admin membaca 50 pendaftaran `pending` **tanpa urutan** (`AdminPanel.jsx` baris 29), jadi banjir pendaftaran dapat menutupi pendaftaran yang sah.

Opsi:
- Satu pendaftaran per akun (ID dokumen deterministik, mis. berdasarkan UID), atau batas jumlah.
- Validasi elemen: setiap fasilitas string pendek; `photos` string URL dengan batas panjang; kunci `openingHours` dibatasi.
- Admin: urutkan antrean `createdAt` menaik (butuh indeks komposit `verificationStatus` + `createdAt`).

Keputusan yang dibutuhkan: apakah satu akun boleh mendaftarkan lebih dari satu warkop.

### S3. Warkop verified dapat diubah tanpa verifikasi ulang (Sedang, perlu keputusan)

Aturan `update` mengizinkan pemilik mengubah `name`, `address`, `coordinates`, `photos`, dan lainnya pada warkop berstatus `verified`, tanpa kembali ke `pending`. Nama pada `verificationAudit` lalu tidak lagi cocok dengan warkop yang tampil di direktori.

Opsi: (a) perubahan nama, alamat, atau koordinat mengembalikan status ke `pending`; (b) field tersebut dikunci setelah verified; (c) dibiarkan karena data umum.

### S4. Tanpa pembatasan frekuensi (Rendah, perlu keputusan)

Posting dan balasan hanya dibatasi panjang dan keharusan punya profil. Pembatasan frekuensi bisa dibuat lewat field opsional di profil (`lastPostAt`) yang dibandingkan dengan `request.time`, atau Firebase App Check (tersedia di Spark). Tindak lanjuti bila spam muncul saat uji lapangan.

### S5. `likes` terbaca publik (Rendah, perlu keputusan)

`likes/{userId}` terbaca siapa saja, termasuk UID dan emoji. Karena UID bukan nama dan profil terkunci untuk pemiliknya, risikonya rendah. Jika ingin lebih privat, pembacaan `likes` dibatasi pada dokumen milik sendiri; ini bergantung pada P1 (angka tampil dari dokumen postingan).

### Yang sudah baik

- Hak admin lewat custom claim, diperiksa di aturan, bukan di antarmuka.
- Keputusan verifikasi dan audit dalam satu batch atomik dengan `getAfter`.
- Laporan: ID deterministik (satu per akun per postingan), privat, audit append-only.
- Hapus dua tahap (`deleting`) menghentikan reaksi dan balasan baru saat pembersihan.
- Storage: foto profil dibatasi pemilik, 2 MB, jenis gambar.
- Tes emulator memakai proyek demo, bukan data produksi.

## Proses dan CI

### C1. Deploy produksi tidak menunggu tes (Tinggi)

`.github/workflows/firebase-hosting.yml` berjalan pada push ke `main` dan menjalankan `firebase deploy --only hosting,firestore:rules` tanpa langkah tes dan tanpa `needs` ke CI. Tes baru berjalan di `ci.yml` pada pull request. Aturan keamanan bisa terdeploy tanpa lolos tes bila PR digabung saat CI gagal atau dilewati. Apakah ada perlindungan cabang `main` (wajib lolos CI sebelum merge) **tidak dapat dilihat dari kode**; periksa di GitHub: Settings → Branches.

Usulan: aktifkan perlindungan cabang dengan status check `build` dan `firestore-rules` wajib, atau tambahkan pekerjaan tes sebagai syarat deploy.

### R1. Rapikan kecil (Rendah)

- `ci.yml` memakai `npm install` dan cache berdasarkan `package.json`; ada `package-lock.json`, jadi `npm ci` lebih konsisten.
- Pemilik masih dapat mengedit `body` dan `topic` setelah `deleting: true`; tutup dengan syarat `resource.data.get('deleting', false) != true`.

## Urutan yang disarankan

1. **P1, P2, P3**: perubahan klien saja, tanpa perubahan skema, menghemat kuota.
2. **S1**: pengetatan aturan satu baris dengan tesnya.
3. **C1**: perlindungan cabang `main`.
4. **S2, S3, U1**: setelah ada keputusan; S2 dan U1 membutuhkan `firestore.indexes.json`.
5. Terakhir S4, S5, R1.

## Belum diperiksa

- Isi data produksi (apakah semua `posts` sudah punya agregat reaksi).
- Pengaturan Firebase Console (App Check, batas anggaran) dan perlindungan cabang GitHub.
- Hasil tes dan build lokal.
