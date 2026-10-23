# ADR-0001: Verifikasi warkop oleh admin

- Status: Diusulkan; belum diimplementasikan
- Cakupan: proyek Firebase khusus WarkopLink / `sl-community-platform`
- Tanggal: 2026-10-24
- Batas biaya: gunakan paket Firebase Spark dan fitur gratis dahulu; tidak mengaktifkan Blaze atau resource berbayar.

## Konteks

Dokumen `warungs/{warungId}` hanya dapat dibuat oleh pengguna yang masuk dengan status `pending`. Firestore Rules melarang pemilik mengubah `verificationStatus`, dan direktori publik hanya membaca dokumen berstatus `verified`. Batas keamanan ini harus dipertahankan.

Proyek memakai paket gratis. Agar tidak mensyaratkan Cloud Functions atau server berbayar, tahap awal menggunakan verifikasi manual oleh pemilik proyek melalui Firebase Console. Ini adalah prosedur operasional terbatas, bukan fitur admin di dalam aplikasi.

## Keputusan yang diusulkan — tahap gratis

1. Jangan menambahkan Cloud Functions, server tambahan, paket Blaze, API berbayar, atau resource berbiaya untuk tahap ini.
2. Pendaftaran dari aplikasi tetap membuat dokumen dengan `verificationStatus: 'pending'`. Form/browser tidak boleh mengirim atau mengubah status menjadi `verified` atau `rejected`.
3. Pemilik proyek yang masuk ke akun Google tepercaya membuka Firebase Console proyek `sl-community-platform` → Firestore Database → `warungs`, lalu memeriksa data pendaftaran dan kecocokan informasi warkop secara manual.
4. Hanya pemilik proyek/operator tepercaya yang memiliki akses administrasi Firebase Console boleh mengubah status dokumen. Jangan memberikan akses Console kepada pemilik warkop atau pengunjung hanya untuk memverifikasi pendaftaran.
5. Jika disetujui, ubah hanya `verificationStatus` menjadi `verified`; jika ditolak, ubah menjadi `rejected`. Catat keputusan, waktu, UID operator, dan alasan penolakan pada metadata audit yang ditetapkan dalam dokumen/prosedur. Jangan mengubah `ownerUid` atau menghapus dokumen untuk menolak pendaftaran.
6. Firestore Rules tetap melarang klien mengubah status verifikasi. Jangan menambahkan pengecualian Rules untuk admin berbasis email/browser.
7. Setelah perubahan manual, periksa bahwa dokumen yang `verified` muncul di direktori publik dan dokumen `pending`/`rejected` tetap tidak tampil. Jangan menggunakan data pribadi nyata untuk uji coba.

## Prosedur operasional manual

- Tinjau nama, alamat, koordinat, fasilitas, jam buka, dan kisaran harga yang diajukan.
- Pastikan bukti dan informasi masuk akal sebelum menyetujui; bila meragukan, biarkan `pending` sambil meminta klarifikasi di luar aplikasi.
- Untuk menyetujui, edit status dari `pending` ke `verified` melalui Firebase Console.
- Untuk menolak, edit status menjadi `rejected` dan catat alasan singkat untuk operator. Status `rejected` tidak ditampilkan pada direktori publik.
- Simpan catatan keputusan di tempat operasional tepercaya yang aksesnya terbatas; jangan menaruh kredensial atau rahasia dalam dokumen, repo, atau log.
- Jangan ubah dokumen `profiles` atau `posts`; jangan sentuh proyek produksi SL RELAX / Bookingpijat.com.

## Pengamanan dan keterbatasan

- Tes Firestore Rules harus tetap membuktikan pemilik tidak dapat mengesahkan diri sendiri, pengguna lain tidak dapat mengubah status, dan klien tidak dapat membuat dokumen langsung berstatus `verified`.
- Console manual melewati Firestore Rules karena memakai hak administrasi; karena itu akses akun Google/Firebase Console harus dijaga dengan autentikasi kuat dan tidak dibagikan.
- Proses manual tidak menyediakan panel admin, validasi server khusus, atau audit trail otomatis. Catatan operator adalah kontrol prosedural, bukan pengganti audit log teknis.
- Jangan pernah membuat field/form untuk menetapkan peran admin dari browser.
- Jangan menyimpan service-account key di frontend, repo, atau log GitHub Actions.
- Bila kelak diperlukan verifikasi otomatis, panel admin, atau audit otomatis, evaluasi kembali arsitektur dan biaya terlebih dahulu. Jangan mengubah paket dari Spark ke Blaze tanpa persetujuan eksplisit.

## Tahap berikutnya

1. Review dokumen ini dan pastikan prosedur manual sesuai kebutuhan operasional.
2. Jalankan CI/tes Rules tanpa mengubah konfigurasi atau data produksi.
3. Merge/deploy dokumentasi hanya setelah persetujuan eksplisit.
4. Implementasi panel admin atau server tepercaya adalah tahap terpisah dan memerlukan evaluasi biaya serta persetujuan baru.

## Alternatif yang ditolak

- **Membiarkan klien mengubah `verificationStatus`:** ditolak karena pemilik dapat mengesahkan diri sendiri.
- **Admin ditentukan dari email di frontend:** ditolak karena pemeriksaan UI dapat dipalsukan.
- **Cloud Functions/Blaze langsung diaktifkan:** tidak dipilih karena pengguna meminta fitur gratis terlebih dahulu.

## Konsekuensi

Semua pendaftaran tetap `pending` dan tersembunyi dari direktori publik sampai operator tepercaya memverifikasinya secara manual melalui Console. Cara ini menjaga biaya tetap gratis dan mempertahankan batas keamanan klien, tetapi membutuhkan pemeriksaan manual dan belum menyediakan pengalaman admin di aplikasi.