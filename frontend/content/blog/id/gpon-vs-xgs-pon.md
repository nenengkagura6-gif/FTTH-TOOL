---
title: "GPON vs XGS-PON: Memilih Arsitektur yang Tepat"
excerpt: "Bandwidth, anggaran optik, dan perbandingan investasi CapEx untuk deployment baru."
category: "GPON Learning"
readTime: "10 min"
date: "Apr 14, 2026"
image: "/blog/gpon-vs-xgs-pon.png"
cta: "opm-calculator"
---

Seiring dengan meningkatnya kebutuhan bandwidth internet, penyedia layanan internet (ISP) harus memutuskan apakah akan tetap menggunakan GPON (Gigabit Passive Optical Network) tradisional atau beralih ke standar XGS-PON (10-Gigabit Symmetrical PON) yang lebih baru.

Dalam artikel ini, kita akan membahas perbedaan teknis, kompatibilitas, dan analisis biaya investasi (CapEx/OpEx).

## 1. Perbedaan Teknis Secara Singkat
Perbedaan paling signifikan terletak pada kapasitas kecepatan bandwidth dan sifat simetrisnya.

| Parameter | GPON | XGS-PON |
| :--- | :--- | :--- |
| **Kecepatan Downstream** | 2.5 Gbps | 10 Gbps |
| **Kecepatan Upstream** | 1.25 Gbps | 10 Gbps |
| **Panjang Gelombang Down** | 1490 nm | 1577 nm |
| **Panjang Gelombang Up** | 1310 nm | 1270 nm |
| **Rasio Splitter Standar** | 1:64 | 1:128 |

GPON bersifat asimetris (kecepatan unduh lebih cepat daripada unggah), yang sudah cukup untuk kebutuhan berselancar web biasa. XGS-PON menyediakan kecepatan 10 Gbps simetris (unggah dan unduh sama cepat), ideal untuk pencadangan cloud, video conference, dan aplikasi berat lainnya.

## 2. Koeksistensi: Berjalan di Atas Satu Kabel Serat yang Sama
Salah satu keunggulan utama XGS-PON adalah penggunaan panjang gelombang yang berbeda dari GPON. Hal ini memungkinkan operator untuk **menjalankan layanan GPON dan XGS-PON secara bersamaan di atas jaringan kabel fisik (ODN) yang sama**.

Untuk melakukan ini, filter **WDM (Wavelength Division Multiplexer)** dipasang di kantor pusat (central office):
* Pelanggan yang ada saat ini tetap menggunakan ONT GPON lama.
* Pelanggan bisnis atau pengguna bandwidth tinggi dapat ditingkatkan ke ONT XGS-PON dengan mudah hanya dengan mengganti perangkat di rumah mereka.

```
GPON OLT (1490/1310nm) ---\
                           +--> [Filter WDM] === Satu Kabel Fiber ===> [Splitter] => Pelanggan
XGS-PON OLT (1577/1270nm) -/
```

## 3. Pertimbangan Biaya (CapEx vs OpEx)
* **GPON**: Memiliki ekosistem perangkat yang sangat matang, sehingga harga port OLT dan ONT sangat murah. Pilihan ideal untuk perumahan umum yang sensitif anggaran.
* **XGS-PON**: Modul optik dan ONT lebih mahal, tetapi memungkinkan Anda mengenakan tarif premium untuk kecepatan simetris 10G dan menangani rasio pembagian yang lebih tinggi (hingga 1:128), menghemat jumlah serat pengumpan (feeder fibers) dari OLT.

Apapun standar yang Anda pilih, perencanaan fisik jaringan yang akurat sangatlah penting. Pastikan kabel dan pembagi Anda dipetakan dengan benar dalam format KML. Anda dapat mengonversi rencana kabel fiber Anda menjadi daftar kuantitas material menggunakan [Alat KML ke BOQ](/dashboard/kml-boq) kami untuk mendapatkan estimasi biaya yang presisi!
