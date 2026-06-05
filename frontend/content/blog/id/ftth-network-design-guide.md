---
title: "Panduan Lengkap Merancang Jaringan FTTH Modern"
excerpt: "Dari perencanaan last-mile hingga rasio splitter, pelajari cara mengarsiteki jaringan FTTH yang scalable."
category: "FTTH Tutorials"
readTime: "12 min"
date: "May 8, 2026"
featured: true
image: "/blog/ftth-network-design-guide.png"
cta: "design-suite"
---

Jaringan FTTH (Fiber to the Home) merupakan tulang punggung pengiriman internet gigabit modern. Merancang jaringan FTTH membutuhkan keseimbangan yang cermat antara kendala fisik di lapangan, anggaran daya optik (optical budget), dan skalabilitas masa depan. Dalam panduan ini, kita akan membahas langkah-langkah dasar yang diperlukan untuk merancang jaringan FTTH dari awal.

## 1. Memahami Topologi FTTH
Sebagian besar penerapan FTTH modern menggunakan arsitektur **Passive Optical Network (PON)**. Disebut \"pasif\" karena menggunakan pembagi optik (splitter) tanpa daya untuk membagikan satu umpan serat optik ke banyak pengguna (biasanya 32 hingga 128 homepass per port OLT).

Jaringan fisik dibagi menjadi tiga segmen utama:
1. **Feeder Network (Jaringan Pengumpan)**: Menghubungkan kantor pusat (OLT - Optical Line Terminal) ke FDC (Fiber Distribution Center) atau ODC (Optical Distribution Cabinet) di lapangan.
2. **Distribution Network (Jaringan Distribusi)**: Membentang dari FDC/ODC ke FAT (Fiber Access Terminal) atau ODP (Optical Distribution Point) di dekat perumahan.
3. **Drop/Access Network (Jaringan Drop)**: Koneksi akhir dari FAT/ODP ke ONT (Optical Network Terminal) di dalam rumah pelanggan.

```
[OLT (Pusat)] === Feeder ===> [ODC/FDT Kabinet] === Distribusi ===> [ODP/FAT Box] --- Drop ---=> [ONT (Rumah)]
```

## 2. Memilih Rasio Splitter dan Penempatannya
Pembagian sinyal dapat dipusatkan di satu kabinet utama (centralized splitting) atau disebarkan secara bertahap di lapangan (cascaded splitting).

* **Centralized Splitting (Rasio 1:32 atau 1:64)**:
  * Semua splitter ditempatkan di dalam satu kabinet pusat (ODC).
  * Sangat mudah untuk pemeliharaan dan pelacakan gangguan.
  * Biaya kabel distribusi lebih tinggi karena serat terpisah harus ditarik ke setiap FAT/ODP.
* **Cascaded / Distributed Splitting (Rasio 1:4 lalu dilanjutkan 1:8)**:
  * Splitter tahap pertama (1:4) diletakkan di node distribusi awal.
  * Splitter tahap kedua (1:8) dipasang di dalam FAT/ODP.
  * Menghemat penggunaan kabel secara signifikan, namun pencarian gangguan splitter di lapangan menjadi lebih rumit.

### Anggaran Tautan Optik (Optical Link Budget)
Anda harus menghitung total pelemahan sinyal (redaman) untuk memastikan sinyal yang tiba di ONT pelanggan berada dalam rentang sensitivitas penerima (biasanya antara -8 dBm hingga -27 dBm).

| Komponen | Redaman Standar |
| :--- | :--- |
| **Pelemahan Kabel Fiber (1310 / 1490 nm)** | ~0.35 dB / km |
| **Splitter 1:8** | ~10.5 dB |
| **Splitter 1:32** | ~16.5 dB |
| **Fusion Splice (Sambungan)** | ~0.05 - 0.1 dB |
| **Pasangan Konektor** | ~0.25 - 0.5 dB |

Pastikan Anda menyisakan **margin keamanan (safety margin)** minimal 2.0 hingga 3.0 dB untuk mengantisipasi penurunan kualitas kabel di masa mendatang atau perbaikan sambungan darurat (repair splices).

## 3. Membuat Layout Peta GIS
Sebelum menggelar kabel, Anda harus membuat model geografis dari jaringan Anda. Insinyur biasanya menggunakan AutoCAD atau Google Earth (KML/KMZ) untuk memetakan:
* **Tiang / Jalur Bawah Tanah**: Jalur perlintasan kabel.
* **Kabinet / Kotak Sambung**: Lokasi ODC dan ODP.
* **Homepass (HP)**: Titik target rumah pelanggan.

### Cara Mempercepat Alur Kerja Pemetaan
Menghitung tiang, panjang kabel, dan jumlah homepass secara manual untuk membuat Bill of Quantities (BOQ) sangat melelahkan dan rawan kesalahan. Untuk mengotomatiskan ini, Anda bisa memanfaatkan alat kami:
* Gunakan [Alat KML ke BOQ](/dashboard/kml-boq) untuk mengonversi desain Google Earth Anda langsung menjadi file Excel BOQ siap pakai.
* Periksa titik ganda di file peta Anda menggunakan [Pendeteksi Duplikat KML](/dashboard/kml-checker) untuk menghindari kelebihan pemesanan material.
