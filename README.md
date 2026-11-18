# TataKas - Kedai Kopi Boemi

Penataan uang usaha: HPP, stok bahan baku, tabel resep, penjualan, nota per orang, dan invoice.
Data disimpan di cloud (Supabase), bukan di HP/laptop. Dibuka dari perangkat mana pun dengan **kode akses yang sama**, tanpa login akun.

## File
- `index.html`, `style.css`, `app.js`, `logo.jpg` : isi web
- `config.js` : tempat mengisi alamat database (Supabase)
- `supabase-setup.sql` : dijalankan sekali di Supabase

## Pasang (sekali saja, sekitar 10 menit)
1. **Supabase** (supabase.com, gratis): New project, lalu buka *SQL Editor*, tempel isi `supabase-setup.sql`, tekan *Run*.
2. Di Supabase buka *Project Settings > API*. Salin **Project URL** dan kunci **anon / publishable** (bukan `service_role`).
3. Buka `config.js`, isi `SUPABASE_URL` dan `SUPABASE_KEY` dengan dua nilai tadi.
4. **GitHub**: buat repository baru, upload semua file di folder ini (termasuk `logo.jpg`).
5. Di repository: *Settings > Pages*, pilih *Deploy from a branch*, branch `main`, folder `/ (root)`, Save.
6. Tunggu 1-2 menit, link web muncul di halaman Pages (bentuknya `https://namakamu.github.io/namarepo/`).

## Pakai
- Buka link di HP dan laptop, masukkan **kode akses yang sama** (minimal 6 karakter).
- Kode berbeda = ruang kerja baru yang terpisah. Siapa pun yang tahu kodenya bisa membuka datamu, jadi buat kode yang panjang dan jangan dibagikan.
- Di HP: buka link, lalu *Tambahkan ke Layar Utama* agar seperti aplikasi.
- Mengubah isi web (misalnya `config.js`) bisa langsung dari github.com atau aplikasi GitHub di HP.

## Catatan
- Project Supabase gratis berhenti sementara kalau 1 minggu tidak dipakai. Data tidak hilang, tinggal dihidupkan lagi dari dashboard Supabase.
- Kalau offline, perubahan tetap tersimpan di perangkat dan dikirim ke cloud otomatis saat online lagi.
- Backup: Pengaturan > Backup (JSON) dan Ekspor penjualan (CSV).
