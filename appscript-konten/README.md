# 📊 Sinkronisasi Rekap Konten ke Google Spreadsheet (3 Sheet Tetap)

Folder ini berisi Google Apps Script khusus untuk menyinkronkan data **Rekap Konten** dari aplikasi ke Google Spreadsheet dengan **3 sheet tetap** yang rapi (tidak menumpuk sheet per bulan):

1. **`Rekap Konten`** — Ada **Dropdown Pilih Bulan** di sel **`B1`**. Ketika bulan diganti, tabel kalender 1–31 otomatis ter-update, lengkap dengan **jenis (`V`/`F`/`🔥 FYP`) dan link kontennya** langsung di dalam sel tanggal.
2. **`Riwayat Upload Konten`** — Daftar riwayat semua konten yang masuk pada bulan terpilih.
3. **`Rekap Pendapatan`** — Rincian jelas: Nama, Divisi, Jumlah Video, Perkalian Fee Video, Jumlah Foto, Perkalian Fee Foto, Jumlah FYP, Views FYP, Bonus FYP, dan Total Pendapatan.

## Cara Update / Pemasangan:
1. Buka **Extensions → Apps Script** di Spreadsheet Anda.
2. Ganti seluruh kode di `Kode.gs` dengan isi terbaru dari `appscript-konten/Code.gs`, lalu **Save**.
3. Jalankan fungsi **`syncKonten`** sekali dari editor Apps Script untuk membuat ke-3 sheet tersebut.
4. Klik **Terapkan → Kelola deployment → Edit (ikon pensil) → Versi baru → Terapkan** agar Web App menggunakan versi terbaru.
