---
title: "Cara Membaca Grafik OTDR Seperti Insinyur Senior"
excerpt: "Pahami pembacaan event, sambungan (splice), dan nilai reflektansi dari grafik output OTDR."
category: "OTDR Guide"
readTime: "8 min"
date: "May 4, 2026"
image: "/blog/reading-otdr-traces.png"
cta: "otdr-analyzer"
---

Optical Time-Domain Reflectometers (OTDR) adalah alat ukur yang sangat penting untuk melacak gangguan dan memvalidasi kualitas kabel fiber optik. Namun bagi mata yang belum terlatih, grafik hasil ukur OTDR (trace) hanya tampak seperti serangkaian garis naik-turun yang acak.

Dalam panduan ini, kita akan mengungkap prinsip dasar pembacaan grafik OTDR dan mempelajari cara mengidentifikasi kejadian (event) jaringan yang umum.

## Apa itu Grafik OTDR?
OTDR memancarkan pulsa cahaya berdaya tinggi ke dalam kabel serat optik dan mengukur intensitas cahaya yang dipantulkan atau dihamburkan kembali (backscattered). Dengan memplot tingkat pengembalian cahaya ini terhadap waktu, OTDR menghasilkan grafik visual yang menunjukkan hilangnya daya (loss) sepanjang jarak kabel.

Sumbu vertikal mewakili **tingkat daya optik (dB)**, dan sumbu horizontal mewakili **jarak (km atau meter)**.

## Kejadian (Events) Kunci pada Grafik OTDR

Ada dua kategori utama kejadian pada grafik: **Reflektif (Reflective)** dan **Non-Reflektif (Non-Reflective)**.

### 1. Kejadian Reflektif (Tampak Sebagai Lonjakan / Spike)
Kejadian reflektif muncul sebagai lonjakan vertikal ke atas sebelum kemudian turun kembali. Ini disebabkan oleh perubahan indeks bias yang tiba-tiba, biasanya terjadi pada batas kaca dan udara.
* **Konektor / Patch Cord**: Setiap titik koneksi fisik (seperti SC/APC atau LC/UPC) akan menghasilkan lonjakan reflektif yang tajam.
* **Sambungan Mekanis (Mechanical Splice)**: Terkadang memicu lonjakan reflektif kecil.
* **Ujung Kabel (Fiber End)**: Lonjakan yang sangat besar diikuti dengan penurunan drastis ke garis batas noise dasar menunjukkan ujung fisik dari serat optik (atau kabel putus total).

### 2. Kejadian Non-Reflektif (Tampak Sebagai Langkah Turun / Step)
Kejadian non-reflektif muncul sebagai penurunan garis grafik secara bersih tanpa adanya lonjakan vertikal ke atas. Ini disebabkan oleh penyerapan atau hamburan cahaya.
* **Penyambungan Peleburan (Fusion Splices)**: Langkah turun kecil yang bersih (biasanya kurang dari 0.05 dB).
* **Tekukan Makro (Macrobends)**: Jika kabel tertekuk terlalu tajam, cahaya akan bocor keluar. Hal ini memicu langkah turun pada grafik. Tekukan tajam dapat dideteksi dengan membandingkan hasil pengukuran pada dua panjang gelombang yang berbeda (misalnya 1310 nm dan 1550 nm); redaman tekukan biasanya jauh lebih tinggi pada panjang gelombang 1550 nm.

```
Kejadian Reflektif (Konektor)       Kejadian Non-Reflektif (Sambungan)
     _/\_
    /    \                               ________
___/      \________                     |
                   \______   =>  _______|
                          \             \________
```

## Daftar Periksa Analisis Grafik Langkah demi Langkah
1. **Identifikasi Kabel Launching (Launch Fiber)**: Pastikan Anda menganalisis area setelah kabel peluncur (biasanya panjangnya 500m hingga 1km yang digunakan untuk melewati zona mati/dead zone awal OTDR).
2. **Ukur Akumulasi Redaman**: Amati kemiringan garis grafik. Kabel single-mode normal rata-rata kehilangan daya sekitar 0.35 dB/km pada wavelength 1310nm, dan 0.20 dB/km pada 1550nm. Kemiringan yang terlalu curam menandakan kualitas kabel yang buruk.
3. **Analisis Setiap Event**: Periksa setiap langkah turun dan lonjakan. Pastikan nilai redaman sambungannya masih berada di bawah ambang batas standar (misalnya splice loss < 0.1 dB).

---

Perlu menganalisis dan mendokumentasikan hasil pengukuran lapangan Anda? Unggah file rekaman Telcordia `.sor` Anda langsung ke [Penganalisis Trace OTDR](/dashboard/otdr-analyzer) kami untuk menampilkan bagan grafik interaktif, meninjau tabel kejadian koneksi, dan mencetak laporan penerimaan proyek format PDF yang profesional.
