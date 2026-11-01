# Sistem Role Platform WarkopLink

## Sumber otorisasi

Role aktif berasal dari Firebase Authentication custom claim `platformRole`, bukan field profil atau nilai dari browser.

- `super_admin`: kendali platform, termasuk verifikasi warkop dan seluruh moderasi.
- `moderator`: membaca laporan privat dan memoderasi laporan obrolan. Tidak dapat memverifikasi warkop atau membaca audit verifikasi.
- `member`: akses anggota biasa; tidak membawa klaim role.
- Klaim lama `admin: true` sementara diperlakukan sebagai Super Admin agar akun lama tidak kehilangan akses selama transisi.

Moderator tidak otomatis menjadi pemilik komunitas atau pemilik warkop. Hak role tidak dapat ditulis oleh klien. Koleksi `platformRoles` ditutup untuk seluruh operasi klien; `platformRoleAudit` hanya dapat dibaca Super Admin.

## Penetapan role

Bootstrap Super Admin pertama disediakan melalui GitHub Actions setelah PR ini digabung ke `main`:

1. Buka tab **Actions** pada repository.
2. Pilih **Bootstrap WarkopLink Super Admin**.
3. Jalankan workflow dengan centang persetujuan `confirm_super_admin_bootstrap`.
4. Workflow hanya menargetkan UID dan email pemilik yang dikunci di skrip; skrip memeriksa kecocokan akun Firebase, status email terverifikasi, dan memastikan belum ada Super Admin lain.

Workflow memakai secret `FIREBASE_SERVICE_ACCOUNT_SL_COMMUNITY_PLATFORM` yang sudah digunakan oleh workflow Hosting. Service account harus memiliki izin Firebase Authentication Admin dan Firestore write; jika belum, workflow berhenti dengan error izin dan tidak boleh diberi izin tambahan tanpa persetujuan pemilik.

Skrip bootstrap juga menolak UID atau email lain. Untuk perubahan role setelah bootstrap, gunakan skrip tepercaya berikut dari lingkungan Admin SDK yang disetujui:

Penetapan atau perubahan berikutnya wajib dilakukan oleh Super Admin aktif:

```sh
node scripts/set-platform-role.mjs <UID> <moderator|member|super_admin> <EMAIL_FIREBASE> <ACTOR_UID_SUPER_ADMIN> --apply
```

Skrip mencocokkan UID dengan email Firebase, mewajibkan email terverifikasi, menjaga custom claims lain, menghapus klaim legacy `admin` saat migrasi, dan menulis catatan ke `platformRoleAudit`. Jangan menyimpan service-account key, token, atau rahasia di repository maupun frontend.

Setelah perubahan role, akun target harus keluar lalu masuk kembali agar token ID diperbarui. Skrip ini belum dijalankan pada akun produksi.

## Batas perubahan

Perubahan role tidak mengubah koleksi `profiles` atau `posts`. Tidak ada migrasi data anggota, postingan, atau perubahan konfigurasi produksi dalam tahap ini.
