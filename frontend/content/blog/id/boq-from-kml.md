---
title: "Menghasilkan BOQ Akurat Langsung dari File KML"
excerpt: "Hindari kesalahan hitung manual dan standarkan alur pembuatan BOQ Anda."
category: "FTTH Tutorials"
readTime: "9 min"
date: "Apr 6, 2026"
image: "/blog/boq-from-kml.png"
cta: "kml-boq"
---

Bill of Quantities (BOQ) adalah salah satu dokumen paling krusial dalam proyek rekayasa fiber optik. BOQ menentukan anggaran, pemesanan material, dan pembayaran subkontraktor. Namun, banyak tim perencanaan masih menyusun BOQ secara manual dengan menghitung titik dan mengukur garis satu per satu di Google Earth.

Berikut adalah panduan langkah demi langkah tentang cara membangun alur pembuatan BOQ otomatis dan bebas kesalahan langsung dari file KML Anda.

## Masalah pada Perhitungan BOQ Manual
Perhitungan manual sering kali menimbulkan beberapa masalah kritis:
* **Human Error (Kesalahan Manusia)**: Melewatkan satu jalur kabel 24-core saja dapat menyebabkan kekurangan material saat penarikan di lapangan.
* **Buang-buang Waktu**: Seorang perencana jaringan bisa menghabiskan waktu berjam-jam hanya untuk mengukur segmen jalur kabel di Google Earth.
* **Tidak Konsisten**: Planner yang berbeda mungkin menggunakan margin slack (kelonggaran kabel) atau format penamaan yang berbeda-beda.

## Menyiapkan File KML untuk Otomatisasi
Untuk menghasilkan BOQ otomatis, file KML Anda harus berisi penanda yang jelas dan terstandarisasi. Pastikan bahwa:
1. **Kabel adalah elemen Jalur/Path** (Placemarks dengan `<LineString>`).
2. **Tiang dan penutup kabel (closure) adalah elemen Titik/Point** (Placemarks dengan `<Point>`).
3. Nama atau deskripsi elemen mengandung kata kunci spesifikasi (misalnya, `CABLE-AERIAL-24C`, `TIANG-9M-BETON`).

## Menghasilkan BOQ dalam Hitungan Detik
Setelah Anda memiliki file KML yang bersih, Anda tidak perlu menulis skrip rumit atau menguraikan XML secara manual.

Kami telah membangun **Alat KML ke BOQ** langsung di situs web ini untuk menangani alur kerja ini:

1. Arahkan ke [Halaman KML ke BOQ](/dashboard/kml-boq).
2. Unggah file `.kml` atau `.kmz` Anda.
3. Unggah templat Excel standar Anda (berisi daftar harga atau kode material).
4. Klik **Proses** dan unduh file Excel BOQ yang sudah terhitung secara instan.

Alat ini secara otomatis mendeteksi:
* Total panjang kabel (menambahkan persentase slack factor khusus).
* Total jumlah tiang berdasarkan jenisnya.
* Jumlah total splitter dan kotak terminasi (FAT/ODP).

Dengan mengotomatiskan proses ini, perusahaan rekayasa dapat menghemat rata-rata **12 jam waktu perencanaan per proyek** dan sepenuhnya menghilangkan kesalahan estimasi manusia.
