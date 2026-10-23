# ADR-0001: Verifikasi warkop oleh admin

- Status: Diusulkan; belum diimplementasikan
- Cakupan: proyek Firebase khusus WarkopLink / `sl-community-platform`
- Tanggal: 2026-10-24

## Konteks

Dokumen `warungs/{warungId}` saat ini hanya dapat dibuat oleh pengguna yang masuk dengan status `pending`. Firestore Rules melarang pemilik mengubah `verificationStatus`, dan direktori publik hanya membaca dokumen berstatus `verified`. Ini adalah batas keamanan yang harus dipertahankan.

Verifikasi membutuhkan identitas admin yang tidak dapat dibuat atau dimodifikasi dari browser pengguna biasa. Tidak boleh ada tombol UI atau field formulir yang bisa mengangkat akun menjadi admin.

## Keputusan yang diusulkan

1. Gunakan Firebase Authentication custom claim `admin: true` sebagai otorisasi, yang hanya dapat ditetapkan oleh skrip tepercaya menggunakan Firebase Admin SDK.
2. Jangan membuat endpoint publik untuk menetapkan custom claim. Bootstrap admin dilakukan secara manual oleh pemilik proyek dari lingkungan tepercaya, dengan kredensial yang tidak masuk ke repo, browser, atau log.
3. Jalankan aksi verifikasi melalui callable Cloud Function/server tepercaya. Fungsi harus memverifikasi bahwa pengguna terautentikasi dan token memiliki `admin === true`; semua input divalidasi di server.
4. Verifikasi hanya mengizinkan transisi eksplisit dari `pending` ke `verified` atau `rejected`. Simpan metadata audit seperti waktu keputusan, UID admin, dan alasan penolakan bila ada. Gunakan operasi transaksi agar keputusan tidak menimpa perubahan bersamaan.
5. Firestore Rules tetap melarang klien mengubah status verifikasi. Hanya kode server tepercaya menggunakan Admin SDK yang boleh melakukan transisi status.
6. Jangan menyediakan tombol verifikasi kepada pemilik biasa. UI admin baru dibuat setelah otorisasi server, Rules, audit, dan tes negatif siap.

## Pengamanan wajib sebelum implementasi

- Tes emulator membuktikan pemilik tidak dapat mengesahkan diri sendiri, pengguna lain tidak dapat mengubah status, dan pengguna tanpa custom claim tidak dapat memanggil aksi admin.
- Tes positif membuktikan admin sah dapat menyetujui atau menolak pendaftaran yang masih `pending`.
- Fungsi menolak ID warkop tidak valid, status selain `pending`, alasan penolakan yang terlalu panjang, serta request tanpa autentikasi.
- Jangan menaruh service-account key atau kredensial Admin SDK di frontend, repo, atau GitHub Actions log.
- Periksa persyaratan billing dan biaya Cloud Functions untuk proyek ini sebelum membuat atau men-deploy fungsi. Jangan mengaktifkan paket berbayar, API, atau resource tanpa persetujuan pemilik.
- Verifikasi tidak boleh mengubah dokumen `profiles` atau `posts`, dan tidak boleh menyentuh proyek produksi SL RELAX / Bookingpijat.com.

## Urutan pelaksanaan

1. Konfirmasi kelayakan biaya dan pilihan runtime server tepercaya.
2. Implementasikan fungsi dan validasi server pada branch terpisah.
3. Tambahkan tes emulator/otorisasi positif dan negatif.
4. Review perubahan Rules serta jalankan seluruh CI.
5. Merge dan deploy hanya setelah persetujuan eksplisit.
6. Uji fungsi setelah deploy tanpa mengubah data pengguna nyata secara sembarangan.

## Alternatif yang tidak dipilih

- **Status admin dari form/browser:** ditolak karena pengguna dapat memalsukan field.
- **Membiarkan klien mengubah `verificationStatus`:** ditolak karena merusak batas keamanan saat ini.
- **Menggunakan email sebagai satu-satunya pemeriksaan admin di frontend:** ditolak karena UI bukan batas otorisasi server.
- **Deploy fungsi sebelum pengecekan biaya:** ditunda sampai biaya dan kebutuhan paket terkonfirmasi.

## Konsekuensi

Pendekatan ini membutuhkan komponen server tepercaya dan proses bootstrap admin yang disiplin. Sampai komponen itu tersedia, semua pendaftaran tetap `pending` dan tidak muncul pada direktori publik; ini perilaku aman yang disengaja.
