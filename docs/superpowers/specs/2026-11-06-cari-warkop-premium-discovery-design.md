# WARKOPLINK — Cari Warkop Premium Discovery Design

- **Tanggal:** 2026-11-06
- **Status:** Disetujui sebagai acuan desain; implementasi belum dimulai
- **Ruang lingkup:** Menu **Cari Warkop** pada repository `Josritzer/warkoplink-`
- **Produk:** WARKOPLINK — Coffee Discovery

## 1. Tujuan produk

Mengubah Cari Warkop dari direktori konvensional menjadi pengalaman **premium coffee discovery**. Pengguna harus dapat menemukan tempat berdasarkan suasana, aktivitas, menu, wilayah, dan kedekatan lokasi—bukan hanya mengetik nama warung.

Pengalaman ini merupakan halaman discovery tersendiri, bukan salinan feed Beranda. Cakupan geografis adalah seluruh Indonesia; lokasi pengguna hanya menjadi konteks awal dan tidak membatasi pencarian.

Prinsip utama:
- Photo-led editorial discovery: foto tempat menjadi elemen visual utama.
- Search-first, mood-led exploration: pencarian utama mudah dijangkau dan kategori suasana mudah dijelajahi.
- Real-data only: tampilkan hanya informasi yang tersedia dan valid.
- Progressive disclosure: filter lanjutan tidak memenuhi layar awal.
- Mobile-first, tetap kuat pada tablet dan desktop.
- Tidak mengorbankan performa, aksesibilitas, atau integritas data demi visual.

## 2. Identitas visual

### 2.1 Arah visual

**Premium Luxury Modern / Modern Coffee Culture** dengan pendekatan editorial specialty-coffee. Gunakan komposisi foto yang kuat, tipografi berkarakter, ruang lega, dan detail aksen yang terkendali.

Hindari:
- Tampilan marketplace generik.
- Kartu putih berulang yang membuat halaman terasa padat.
- Blur/glass berlebihan dan dekorasi yang tidak memiliki fungsi.
- Aksen oranye terang.
- Ikon yang tercerai-berai atau kategori yang turun menjadi beberapa baris pada layar HP.
- Placeholder atau angka demonstrasi yang terlihat seperti data asli.

### 2.2 Design tokens awal

| Token | Nilai | Pemakaian |
|---|---|---|
| Espresso | `#211914` | Warna dasar gelap / teks utama |
| Dark roast | `#30231D` | Surface gelap dan panel |
| Warm ivory | `#F4EFE7` | Latar terang utama |
| Paper | `#E8DFD2` | Surface sekunder dan separator |
| Brass | `#B08A55` | Aksen, fokus, detail premium |
| Muted olive | `#74745B` | Aksen sekunder yang hemat |

Nilai ini adalah titik awal. Sebelum implementasi, periksa token dan tema global yang sudah ada agar tidak membuat sistem warna kedua yang saling bertentangan. Pertahankan dark mode dengan nuansa espresso, bukan hitam murni. Pastikan kontras teks, fokus keyboard, dan status interaktif memenuhi kebutuhan aksesibilitas.

### 2.3 Tipografi dan fotografi

- Gunakan pasangan display/editorial dan sans-serif yang sudah tersedia di proyek bila memungkinkan.
- Jangan menambah ketergantungan font eksternal atau jaringan baru tanpa alasan teknis.
- Foto harus memakai rasio yang konsisten per jenis komponen, crop yang disengaja, dan ukuran responsif.
- Bila foto tidak tersedia, gunakan fallback visual yang jelas sebagai fallback—jangan mengarang foto atau informasi tempat.

## 3. Struktur pengalaman halaman

Urutan bagian yang direkomendasikan:

1. **Discovery Hero**
   - Foto editorial sebagai latar/visual utama.
   - Headline singkat dan identitas Coffee Discovery.
   - Kolom pencarian utama.
   - Ringkasan cakupan lokasi yang dapat dibuka untuk mengganti wilayah.

2. **Explore by Mood**
   - Rail kategori horizontal satu baris dan dapat digeser.
   - Kategori awal: Ngopi Santai, Kerja & Laptop, Nongkrong, Komunitas, Nobar, Menu Spesial.
   - Kategori harus dipetakan ke data aktivitas/menu yang benar-benar ada. Kategori tanpa dukungan data tidak boleh menghasilkan klaim palsu.

3. **Featured Places**
   - Tempat unggulan dengan foto besar dan komposisi editorial.
   - Nama, status verifikasi bila valid, lokasi ringkas, menu spesial, dan atribut relevan.
   - Sumber penentuan unggulan harus eksplisit dan berbasis data yang tersedia; jangan membuat ranking palsu.

4. **Nearby & Regional Discovery**
   - Eksplorasi sekitar lokasi GPS atau wilayah pilihan.
   - Mendukung Indonesia, provinsi, kabupaten/kota, kecamatan, dan desa sesuai katalog wilayah yang sudah digunakan proyek.
   - Izin GPS bersifat opsional.

5. **What's Happening**
   - Acara dan aktivitas yang masih relevan berdasarkan data aktual.
   - Kartu mengarah ke detail acara atau profil warkop yang terkait.

6. **Discovery Results**
   - Hasil pencarian dan filter lanjutan.
   - Kontrol List/Map berbagi state dan dataset yang sama.
   - Pagination atau pemuatan bertahap, bukan memuat seluruh direktori tanpa batas.

## 4. Arsitektur komponen yang dituju

Nama berikut adalah batas tanggung jawab yang disarankan, bukan kewajiban membuat semua komponen baru. Audit dan gunakan kembali komponen yang sudah tepat.

| Komponen | Tanggung jawab |
|---|---|
| `WarungDiscoveryPage` | Container halaman, orchestration, dan state discovery |
| `DiscoveryHero` | Hero editorial dan entry point pencarian |
| `DiscoverySearch` | Input, debounce, dan tindakan pencarian |
| `RegionScopeSelector` | Pemilihan cakupan wilayah dan GPS |
| `MoodCategoryRail` | Navigasi kategori horizontal |
| `FeaturedWarungSection` | Tempat unggulan berbasis data |
| `WarungEditorialCard` | Kartu foto dan identitas warkop |
| `NearbyWarungSection` | Hasil discovery berdasarkan lokasi |
| `ActivityDiscoverySection` | Acara dan aktivitas aktual |
| `DiscoveryResults` | Hasil, sorting, dan pagination |
| `DiscoveryFilterSheet` | Filter lanjutan; bottom sheet di mobile |
| `DiscoveryMapView` | Peta Leaflet/OpenStreetMap |
| `DiscoveryEmptyState` | Hasil kosong dan tindakan pemulihan |

Komponen halaman dapat tetap berada di struktur direktori yang sekarang atau dipisah secara bertahap setelah pemeriksaan dependensi. Jangan melakukan refactor besar hanya untuk mengganti nama komponen.

## 5. State dan perilaku interaksi

Gunakan satu model state discovery yang konsisten, minimal mencakup:
- `query`
- `category`
- `regionScope`
- `visitorLocation` dan status izin/lokasi
- `filters`
- `sort`
- `viewMode` (list/map)
- `paginationCursor` atau status pemuatan lanjutan

Perilaku:
- Debounce pencarian sekitar 250–350 ms; batalkan atau abaikan hasil pencarian lama ketika query berubah.
- Pencarian dapat mencocokkan nama, alamat/wilayah, menu, fasilitas, dan aktivitas sejauh field tersebut benar-benar tersedia.
- Pemilihan kategori, wilayah, filter, dan sorting harus menghasilkan state yang dapat diprediksi dan dapat di-reset.
- Filter lanjutan dibuka melalui bottom sheet pada mobile; gunakan panel yang proporsional pada desktop.
- List dan map harus menampilkan hasil yang sama setelah filter diterapkan.
- Marker peta membuka preview ringkas dan jalur ke profil warkop.
- Kartu tempat dapat dibuka untuk melihat profil/detail.
- Status buka hanya ditampilkan jika jadwal operasional lengkap dan valid.
- Jarak hanya ditampilkan jika koordinat tempat dan titik referensi tersedia.
- Jika GPS ditolak/tidak tersedia, pengguna tetap dapat memilih wilayah secara manual.
- Jangan mengklaim “terdekat”, “populer”, “buka sekarang”, atau “aktif” jika data pendukung tidak memadai.

## 6. Data, query, dan batas backend

### 6.1 Sumber data yang dipertahankan

Gunakan sumber data yang sudah ada:
- Firestore `warungs` untuk direktori warkop.
- Struktur data acara yang sudah digunakan aplikasi.
- Subkoleksi followers yang sudah ada bila diperlukan dan aman untuk dibaca.
- Firebase Auth, profil, dan data komunitas yang sudah ada tetap dipertahankan.
- Katalog wilayah resmi yang saat ini digunakan oleh pemilih wilayah.
- Leaflet dan OpenStreetMap untuk peta.

Tidak ada migrasi koleksi atau perubahan skema yang otomatis disetujui oleh dokumen ini.

### 6.2 Risiko performa yang harus ditangani

Audit kode sebelumnya menemukan dua pola yang perlu menjadi perhatian implementasi:
1. Query awal direktori mengambil warung terverifikasi secara bertahap, tetapi mode pencarian/filter tertentu dapat memuat seluruh halaman tambahan dan melakukan penyaringan di client.
2. Pengurutan popularitas dapat menghitung jumlah followers melalui query per warung. Pola ini berpotensi meningkatkan jumlah pembacaan saat jumlah warung bertambah.

Persyaratan:
- Jangan memperluas full-collection scan sebagai solusi pencarian.
- Pertahankan pagination dan batasi kandidat data yang dimuat.
- Hindari query followers per kartu/per item dalam render.
- Sebelum memilih strategi full-text search, periksa field, indeks, rules, pola query, dan kebutuhan produk yang aktual.
- Gunakan `nameNormalized` dan indeks yang tersedia bila sesuai dengan query aktual.
- Jika pencarian lintas field tidak dapat dilakukan secara efisien dengan struktur saat ini, dokumentasikan keterbatasannya dan ajukan opsi arsitektur terpisah. Jangan diam-diam menambah layanan berbayar, koleksi, field, atau indeks.
- Popularitas hanya boleh ditampilkan jika sumber metriknya valid dan efisien. Jika tidak, gunakan urutan deterministik yang didukung data dan jangan memberi label “populer”.

### 6.3 Aturan validitas data

- `isOpenNow` hanya boleh menggunakan jadwal mingguan yang lengkap dan valid; dukung jadwal 24 jam dan lintas tengah malam sesuai helper yang ada.
- Perhitungan jarak memakai koordinat yang sudah tersimpan dan rumus Haversine untuk jarak garis lurus; jangan menyebutnya estimasi rute jalan.
- Event harus difilter berdasarkan status dan waktu aktual; event batal/kedaluwarsa tidak masuk daftar aktif.
- Wilayah harus menggunakan nilai kode/nama yang konsisten dengan katalog dan data tersimpan.
- Field kosong disembunyikan atau ditampilkan sebagai keterangan data belum tersedia secara eksplisit—jangan mengarang nilainya.

## 7. Peta

- Pertahankan implementasi Leaflet dan tile OpenStreetMap yang sudah ada.
- Gunakan koordinat dari data warkop yang valid.
- Peta dan daftar harus berbagi hasil serta filter yang sama.
- Marker membuka preview tempat; preview menyediakan tautan ke profil.
- Tangani koordinat tidak valid, tile gagal dimuat, dan lokasi pengguna tidak tersedia.
- Tidak menambahkan Google Maps, Google Routes, atau layanan peta berbayar untuk WarkopLink.

## 8. Responsive behavior

Target pengujian:
- Mobile: 360–430 px.
- Tablet: 768–1024 px.
- Desktop: 1280 px ke atas.

Mobile:
- Hero memanfaatkan lebar layar tanpa membuat pencarian sulit dijangkau.
- Kategori tetap satu baris horizontal dan dapat digeser.
- Kartu menggunakan foto dominan dengan informasi ringkas.
- Filter lanjutan berada di bottom sheet.
- Tidak ada tab, label, tombol, atau navigasi yang terpotong/bertumpuk.
- Hindari sticky element bertumpuk dengan header atau bottom navigation.

Tablet:
- Gunakan grid adaptif dengan hierarki visual yang tetap jelas.
- Pertahankan ruang yang cukup untuk pencarian, filter, dan preview peta.

Desktop:
- Layout editorial yang lebih luas; dapat menggunakan beberapa kolom sesuai ruang.
- Hasil dan peta dapat ditampilkan berdampingan jika tidak mengorbankan keterbacaan.
- Jangan memaksakan tiga kolom pada layar yang tidak cukup lebar.

Hormati `prefers-reduced-motion`, navigasi keyboard, focus-visible, dan ukuran target sentuh.

## 9. States dan kegagalan

Setiap bagian yang memuat data harus memiliki state yang dirancang:
- Loading/skeleton dengan dimensi yang stabil agar layout tidak melompat.
- Empty result dengan tindakan untuk menghapus filter atau mengganti wilayah.
- Error dengan tindakan mencoba kembali.
- GPS denied/unavailable dengan fallback pemilihan wilayah.
- Map loading/error dengan opsi kembali ke daftar.
- Data parsial: tampilkan hanya atribut yang valid.
- Offline/network interruption: jangan menghapus input atau state pencarian pengguna secara tidak perlu.

## 10. Acceptance criteria

Desain dianggap siap implementasi/diterima jika:
- Cari Warkop terasa sebagai pengalaman discovery terpisah dari Beranda.
- Identitas premium coffee culture konsisten di light dan dark mode.
- Hero, rail kategori, kartu foto, hasil, filter, dan peta responsif.
- Kategori tampil satu baris pada viewport mobile.
- Query, kategori, wilayah, filter, sorting, dan mode peta/list tersinkron.
- Hasil hanya menggunakan data aktual; tidak ada placeholder palsu atau metrik rekaan.
- Pencarian tidak memicu pemuatan seluruh koleksi tanpa batas.
- Tidak ada query followers per item yang tidak terkendali.
- Status operasional, jarak, dan event mengikuti validasi data.
- Profil dan detail acara dapat dicapai dari kartu/marker yang relevan.
- Tidak ada regresi navigasi, autentikasi, profil, feed, atau dark mode.
- Semua pemeriksaan CI yang relevan lulus tanpa menonaktifkan atau melemahkan tes.

## 11. Rencana implementasi bertahap

1. **Discovery Shell:** struktur halaman, design tokens terintegrasi, hero, dan responsive foundation.
2. **Search Experience:** state terpadu, pencarian, wilayah, GPS, kategori, dan filter.
3. **Visual Catalog:** featured/nearby cards, foto, identitas, dan event discovery.
4. **Map Experience:** integrasi list/map dan marker preview.
5. **Performance & QA:** query/read audit, tests, responsive verification, dan regresi.

Setiap tahap dilakukan di branch kerja terpisah dari `main` terbaru. Jalankan tes yang relevan dan review diff sebelum PR. Merge/deploy hanya setelah CI dan verifikasi siap serta ada persetujuan pengguna.

## 12. Batas perubahan dan keselamatan proyek

Dokumen ini hanya menyetujui penyimpanan spesifikasi desain. Dokumen ini **bukan** persetujuan untuk:
- Mengubah Firebase Auth, Firestore Rules, Storage Rules, atau data produksi.
- Menghapus atau mengganti koleksi `profiles` dan `posts`.
- Mengubah secrets, billing, konfigurasi produksi, atau mengaktifkan layanan berbayar.
- Menambah backend, koleksi, field, indeks, atau penyedia pihak ketiga tanpa audit dan persetujuan.
- Mengubah Bookingpijat/SULES atau proyek lain.
- Merge atau deploy perubahan implementasi.

Implementasi harus tetap berada pada repository dan proyek WarkopLink yang benar. Periksa source-of-truth terbaru sebelum perubahan kode; jangan mengandalkan screenshot atau tampilan live saja.
