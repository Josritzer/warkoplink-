# Keputusan Skema Obrolan WarkopLink

Tanggal keputusan: 28 Oktober 2026

## Keputusan

Koleksi obrolan publik WarkopLink **tetap `posts`**. Koleksi `chatMessages` yang tercantum di blueprint awal **tidak dibuat**. Subkoleksi `posts/{postId}/likes` dan `posts/{postId}/replies` tetap dipakai.

## Alasan

- `posts` sudah memuat seluruh fitur obrolan: suka dengan emoji, balasan, hapus dua tahap (`deleting`), dan agregat reaksi, lengkap dengan Firestore Rules dan tes emulator.
- `postReports`, `postReportModeration`, dan `postReportAudit` bergantung pada `posts`. Mengganti nama koleksi akan mengubah aturan, panel moderasi, skrip backfill, dan tes tanpa manfaat bagi pengguna.
- Nama `chatMessages` tidak dipakai di kode mana pun.
- Batas proyek: data lama tidak dihapus otomatis dan skema harus kompatibel. Migrasi nama koleksi bertentangan dengan batas itu.

## Aturan perubahan skema

1. Koleksi obrolan tetap `posts`; jangan membuat koleksi pengganti.
2. Field baru hanya boleh **opsional** dan harus dicatat di `validPost` pada `firestore.rules`.
3. Field yang sudah ada tidak diubah artinya dan tidak dihapus.
4. Setiap perubahan aturan wajib punya tes emulator (proyek demo, bukan data produksi) yang dijalankan lewat CI.
5. Koleksi `profiles` tidak diubah.
6. Bookingpijat.com dan infrastruktur produksi SL RELAX tidak disentuh.

## Catatan

Belum diperiksa: apakah ada data nyata di `posts` produksi. Itu hanya terlihat di Firebase Console dan tidak mengubah keputusan ini.
