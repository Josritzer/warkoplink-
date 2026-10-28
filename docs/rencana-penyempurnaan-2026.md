# Rencana Penyempurnaan WarkopLink (Lamongan) — Acuan Web App 2026

Dibuat 29 Okt 2026 dari audit baca-saja repo `sl-community-platform` (commit `b1724b2`). Tes dan build **belum dijalankan** karena registry npm tidak terjangkau saat audit; jalankan `npm test` dan `npm run build` sebelum merge.

## Acuan 2026 yang dipakai

- **Core Web Vitals** (ambang 2026 tidak berubah): LCP < 2,5 dtk, INP < 200 ms, CLS < 0,1, diukur pada persentil ke-75 pengguna nyata. INP menggantikan FID sejak Maret 2024; data lapangan (bukan hanya Lighthouse) yang menentukan.
- **Mobile-first**: pencarian lokal didominasi ponsel; target halaman cepat di Android kelas menengah dengan koneksi tidak stabil.
- **PWA**: manifest lengkap, service worker, dan informasi dasar tetap terbuka saat offline.
- **Aksesibilitas**: WCAG 2.2.
- **Kepercayaan lokal**: informasi transparan dan terverifikasi lebih berharga daripada tampilan mewah.

## Kondisi saat ini (hasil audit)

Sudah baik: direktori hanya menampilkan warkop `verified`, paginasi 30 data, panel admin + audit atomik, aturan Firestore dengan tes emulator, CI (build, tes, rules), service worker network-first untuk navigasi.

Temuan:

1. `src/App.jsx` 943 baris memuat banyak fitur sekaligus; sulit diuji dan dibaca, dan memperbesar bundle awal.
2. Pencarian direktori hanya menyaring 30 data yang sudah dimuat, jadi warkop yang belum termuat tidak ditemukan.
3. Direktori belum punya filter (kecamatan, fasilitas, kisaran harga, buka sekarang), kontak (WhatsApp/telepon), maupun foto (field `photos` ada tetapi selalu kosong).
4. Ikon PWA hanya satu SVG dengan `purpose: "any maskable"` digabung; sebaiknya PNG 192/512 plus ikon maskable terpisah.
5. Belum ada metadata berbagi (Open Graph) dan halaman statis ramah mesin pencari; SPA murni lemah untuk pencarian lokal.
6. Service worker memakai cache-first untuk aset tanpa batas ukuran/versi pembersihan selain nama cache.
7. `README.md` usang (menyebut Render dan hanya `profiles`/`posts`; repo kini memakai Firebase Hosting dan koleksi `warungs` dll).
8. Audit aturan Firestore dan performa (Tahap 4) masih tertunda.

## Perubahan yang sudah disiapkan (patch ini)

- `manifest.webmanifest`: ikon `any` dan `maskable` dipisah; `dir` ditambahkan.
- `index.html`: metadata Open Graph/Twitter, `color-scheme`, dan pesan `noscript`.

Tidak ada perubahan pada kode aplikasi, skema data, maupun `firestore.rules`.

## Urutan kerja yang disarankan (kompatibel dengan 5 tahap)

| Tahap | Pekerjaan | Catatan kompatibilitas |
|---|---|---|
| 2 | Pecah `WarungDirectory` ke `src/directory/`; tambah filter fasilitas/harga; pencarian server-side lewat `nameNormalized` (prefix) | Field baru hanya opsional |
| 2 | Field opsional `contact.whatsapp`; tombol "Hubungi" | Perlu perubahan `validWarung` di rules + tes emulator |
| 3 | Pertahankan koleksi `posts`; tambah batas laju dan pelaporan yang sudah ada | Tidak membuat `chatMessages` |
| 4 | Audit rules + performa: `React.lazy` untuk panel admin, ukur LCP/INP/CLS dengan paket `web-vitals`, ikon PNG, aksesibilitas WCAG 2.2 | Uji hanya di emulator |
| 4 | Foto warkop lewat Storage dengan kompresi di klien dan batas ukuran | Periksa `storage.rules` |
| 5 | Uji lapangan Lamongan: ponsel Android kelas menengah, koneksi lambat, 5–10 warkop pilot | Kumpulkan data lapangan CWV |

## Batas yang tetap dijaga

Bookingpijat.com dan infrastruktur produksi SL RELAX tidak disentuh; data lama tidak dihapus otomatis; merge dan deploy hanya setelah ditinjau.
