# Sistem Role Platform WarkopLink

## Sumber otorisasi

Role aktif berasal dari Firebase Authentication custom claim `platformRole`, bukan field profil atau nilai dari browser.

- `super_admin`: kendali platform, termasuk verifikasi warkop dan seluruh moderasi.
- `moderator`: membaca laporan privat dan memoderasi laporan obrolan. Tidak dapat memverifikasi warkop atau membaca audit verifikasi.
- `member`: akses anggota biasa; tidak membawa klaim role.
- Klaim lama `admin: true` sementara diperlakukan sebagai Super Admin agar akun lama tidak kehilangan akses selama transisi.

Moderator tidak otomatis menjadi pemilik komunitas atau pemilik warkop. Hak role tidak dapat ditulis oleh klien. Koleksi `platformRoles` ditutup untuk seluruh operasi klien; `platformRoleAudit` hanya dapat dibaca Super Admin.

## Penetapan role

Jalankan hanya dari lingkungan lokal tepercaya yang telah login ke Google Cloud ADC untuk proyek `sl-community-platform`.

Bootstrap Super Admin pertama (hanya setelah UID dan email diverifikasi langsung di Firebase Authentication):

```sh
node scripts/set-platform-role.mjs <UID> super_admin <EMAIL_FIREBASE> --bootstrap --apply
```

Penetapan atau perubahan berikutnya wajib dilakukan oleh Super Admin aktif:

```sh
node scripts/set-platform-role.mjs <UID> <moderator|member|super_admin> <EMAIL_FIREBASE> <ACTOR_UID_SUPER_ADMIN> --apply
```

Skrip mencocokkan UID dengan email Firebase, mewajibkan email terverifikasi, menjaga custom claims lain, menghapus klaim legacy `admin` saat migrasi, dan menulis catatan ke `platformRoleAudit`. Jangan menyimpan service-account key, token, atau rahasia di repository maupun frontend.

Setelah perubahan role, akun target harus keluar lalu masuk kembali agar token ID diperbarui. Skrip ini belum dijalankan pada akun produksi.

## Batas perubahan

Perubahan role tidak mengubah koleksi `profiles` atau `posts`. Tidak ada migrasi data anggota, postingan, atau perubahan konfigurasi produksi dalam tahap ini.
