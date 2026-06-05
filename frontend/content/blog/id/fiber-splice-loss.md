---
title: "Memahami Redaman Sambungan (Splice Loss) dan Cara Meminimalisirnya"
excerpt: "Penyambungan mekanis vs fusion, kualitas kupas/cleave, dan ambang batas redaman yang dapat diterima."
category: "Fiber Engineering"
readTime: "5 min"
date: "Mar 30, 2026"
image: "/blog/fiber-splice-loss.png"
cta: "splice-manager"
---

Penyambungan optik (fusion splicing) adalah proses menggabungkan dua serat optik secara ujung-ke-ujung menggunakan busur listrik. Tujuannya adalah untuk menyatukan serat kaca sehingga cahaya yang melaluinya tidak tersebar atau dipantulkan kembali.

Namun, setiap sambungan selalu menghasilkan sejumlah kecil kehilangan daya atau redaman (splice loss). Mari kita pelajari bagaimana redaman sambungan terjadi dan bagaimana menjaganya tetap dalam batas aman yang dapat diterima.

## 1. Berapa Batas Redaman Sambungan yang Dapat Diterima?
Dalam jaringan serat optik single-mode, standar industri untuk batas maksimum redaman sambungan biasanya adalah:
* **Ambang Batas Standar**: **0.1 dB** per sambungan.
* **Target Telekomunikasi**: **0.05 dB** atau lebih rendah (sangat mungkin dicapai dengan alat fusion splicer penyelarasan inti/core-alignment modern).

Jika hasil sambungan melebihi 0.1 dB, sambungan tersebut harus dipotong dan disambung ulang.

## 2. Penyebab Umum Redaman Sambungan Tinggi
Redaman sambungan yang tinggi biasanya disebabkan oleh salah satu dari tiga masalah berikut:

### A. Kualitas Pemotongan (Cleave) yang Buruk
Pemotong serat (cleaver) memotong serat kaca sebelum disambung. Jika sudut pemotongan terlalu miring (lebih besar dari 1 derajat) atau terdapat gompal/cacat pada ujung potongan, serat tidak akan menyatu dengan bersih.
* **Solusi**: Bersihkan pisau cleaver secara teratur dan putar/ganti mata pisau jika sudah mulai tumpul.

### B. Kontaminasi (Kotoran)
Debu, kelembapan, atau minyak pada inti serat akan terbakar ke dalam kaca saat busur listrik dilepaskan, menciptakan penghalang yang memicu redaman tinggi.
* **Solusi**: Selalu kupas (strip) dan bersihkan serat dengan alkohol *sebelum* meletakkannya di cleaver. Setelah serat dipotong (cleaved), jangan pernah membersihkannya lagi dengan tisu (karena tisu dapat meninggalkan serat/lint pada ujung yang bersih).

### C. Ketidakcocokan Inti (Fiber Core Mismatch)
Jika Anda menyambungkan serat dari produsen yang berbeda atau jenis yang berbeda (misalnya serat standar single-mode G.652.D disambung ke serat tahan tekukan G.657.A1), mungkin ada sedikit ketidakcocokan pada Mode Field Diameter (MFD).
* **Solusi**: Gunakan fusion splicer tipe **Core-Alignment** daripada Clad-Alignment. Sistem penyelarasan inti secara otomatis menyesuaikan posisi inti serat agar presisi sebelum peleburan.

---

Sedang melakukan penyambungan kabel fiber di lapangan? Gunakan [Pencari Kode Warna Fiber](/dashboard/fiber-color-code) interaktif kami untuk mengetahui secara instan pemetaan warna tabung (tube) dan inti (core) untuk nomor serat berapa pun berdasarkan standar TIA-598-C maupun standar Telkom Indonesia.
