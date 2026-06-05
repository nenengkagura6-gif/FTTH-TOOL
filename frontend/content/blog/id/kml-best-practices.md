---
title: "Praktik Terbaik Penggunaan KML untuk Proyek FTTH"
excerpt: "Aturan penamaan, struktur folder, dan penataan gaya agar mudah dibaca saat serah terima proyek."
category: "KML Mapping"
readTime: "6 min"
date: "Apr 29, 2026"
image: "/blog/kml-best-practices.png"
cta: "kml-checker"
---

Google Earth KML (Keyhole Markup Language) telah menjadi standar de-facto untuk desain awal dan survei lapangan dalam proyek penggelaran jaringan FTTH. Namun, tanpa standar format yang ketat, file KML dapat dengan cepat menjadi berantakan dan menyebabkan keterlambatan saat desain teknis lanjutan dan estimasi material.

Berikut adalah beberapa praktik terbaik untuk menyusun file KML pada proyek FTTH Anda.

## 1. Gunakan Standar Penamaan Elemen
Setiap elemen di dalam file KML Anda harus mengikuti format penamaan yang konsisten. Hal ini memudahkan pembaca otomatis (seperti alat parsing di situs web ini!) untuk mengkategorikan item secara akurat.

* **Tiang (Poles)**: Gunakan awalan seperti `PL-` atau `POLE-` diikuti dengan nomor unik.
  * *Contoh:* `PL-CBN01-001`
* **Homepass (HP / Pelanggan)**: Gunakan awalan seperti `HP-` atau `H-` diikuti dengan nama jalan atau ID koordinat.
  * *Contoh:* `HP-JL-MAWAR-12`
* **Kabel Fiber**: Beri nama jalur berdasarkan jenis dan kapasitas seratnya.
  * *Contoh:* `KABEL-12C-UDARA` atau `FEEDER-24C`

## 2. Pisahkan Elemen ke Dalam Folder
Jangan pernah menumpuk semua penanda titik dan jalur di folder root file KML Anda. Gunakan fitur folder Google Earth untuk mengelompokkan item secara logis:

```
├── [NAMA_PROYEK]
│   ├── FDC_ODC (Kabinet)
│   ├── FAT_ODP (Kotak Distribusi)
│   ├── TIANG_POLES (Tiang)
│   ├── KABEL_CABLES (Jalur Kabel)
│   └── HOMEPASS (Titik Rumah Pelanggan)
```

Pemisahan folder mencegah alat otomatis salah menafsirkan jalur kabel sebagai batas wilayah, atau titik tiang sebagai kabinet distribusi.

## 3. Hindari Titik Ganda (Duplikasi)
Salah satu masalah paling umum dalam pemetaan KML kolaboratif adalah adanya titik ganda. Beberapa surveyor lapangan mungkin menandai tiang yang sama dua kali atau menandai rumah yang sama dengan nama berbeda.
* Duplikasi ini mengacaukan perhitungan material (BOQ), menyebabkan pembengkakan anggaran belanja barang.
* Sebelum menyerahkan file KML untuk produksi, jalankan file tersebut di [Pendeteksi Duplikat KML](/dashboard/kml-checker) kami untuk membersihkan titik yang bertumpuk secara otomatis.

## 4. Konversi KML Langsung Menjadi Bill of Materials (BOQ)
Setelah KML terstruktur dengan baik:
1. Simpan/ekspor sebagai `.kml` atau `.kmz`.
2. Buka [Alat KML ke BOQ](/dashboard/kml-boq) kami.
3. Unggah file KML Anda bersama dengan templat Excel material Anda.
4. Dapatkan file hitungan BOQ lengkap Anda dalam hitungan detik!
