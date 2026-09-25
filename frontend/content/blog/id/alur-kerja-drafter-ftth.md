---
title: "Alur Kerja Drafter FTTH: Dari Tagging HP Sampai Gambar CAD"
excerpt: "Delapan langkah otomatis untuk mengubah boundary cluster menjadi desain APD, database HP, BOQ, dan gambar AutoCAD siap serah terima."
category: "FTTH Tutorials"
readTime: "10 min"
date: "Sep 25, 2026"
image: "/blog/alur-kerja-drafter-ftth.jpg"
cta: "drafter-suite"
---

Pekerjaan drafter FTTH jarang berhenti di satu file. Dari satu boundary cluster, drafter harus menandai rumah, menggambar basic map, menyusun desain APD, mengisi database homepass, menghitung BOQ, lalu menyerahkan gambar AutoCAD lengkap dengan kop dan DESIGN SUMMARY. Kalau semuanya dikerjakan manual, satu cluster bisa memakan beberapa hari, dan setiap tahap berisiko salah hitung.

Artikel ini membahas urutan kerja yang kami pakai di menu **Drafter**, beserta hal yang perlu disiapkan di setiap langkah supaya hasilnya langsung terpakai.

## Gambaran Alur

```
Boundary cluster
  -> 1. Auto Tagging HP        (titik rumah NN-01, NN-02, ...)
  -> 2. KML To BasicMap        (kotak rumah + jalan -> DXF)
  -> 3. KML To APD             (FAT, kabel, sling, penomoran tiang)
  -> 4. KML to Database HP     (Excel HPDB per FDT)
  -> 5. KML to BOQ             (Excel BOQ per FDT)
  -> 6. KML to CAD             (gambar desain -> DXF + DESIGN SUMMARY)
  -> 7. Auto Coding APD        (kode FDT/FAT/kabel/tiang)
  -> 8. Pole Auto-Sorter       (rapikan nomor tiang)
```

Setiap tool menerima KML/KMZ dan mengembalikan hasil yang bisa langsung dipakai tool berikutnya. Setelah proses selesai, setiap tool juga menampilkan **laporan hasil**: angka ringkas (jumlah FAT, tiang, HP) dan daftar hal yang perlu diperiksa. Jadi data yang terlewat tidak lagi tersembunyi di balik status "sukses".

## 1. Auto Tagging HP
Mulailah dari poligon batas cluster yang digambar di Google Earth. [Auto Tagging HP](/dashboard/auto-placemark) mengambil data bangunan dan jalan dari OpenStreetMap, menyaring rumah yang benar-benar menghadap jalan (baris depan), lalu membuat titik placemark untuk setiap rumah.

Titik diberi nama **NN-01, NN-02, dst.** dan dinomori menyusuri jalan, bukan melompat dari utara ke selatan. Hasilnya tetap perlu dicek di lapangan, terutama di area yang data bangunannya di OpenStreetMap belum lengkap.

## 2. KML To BasicMap
[KML To BasicMap](/dashboard/basicmap) mengubah titik HP menjadi **kotak rumah** yang menghadap jalan, sejajar dengan tetangganya, dan tidak saling tumpang tindih. Tepi dan nama jalan diambil dari OpenStreetMap. Hasilnya berupa DXF (1 unit = 1 meter), file `_jalan.csv`, dan laporan proses.

> **Tips:** jalan yang belum bernama di OpenStreetMap bisa diisi di kolom `nama_dipakai` pada file `_jalan.csv`. Unggah CSV itu saat memproses ulang KML yang sama, dan nama jalannya ikut tergambar.

## 3. KML To APD
Inilah inti desain. [KML To APD](/dashboard/kml-apd) membaca folder LINE, BOUNDARY, kabel DISTRIBUTION, tiang (POLE/NP/EXT), HP, dan FDT, lalu:
* menamai boundary FAT (A01, A02, ...) dan memasukkan HP ke boundary-nya,
* menempatkan FAT di tiang yang berada di jalur kabel,
* menghitung panjang kabel, slack, dan toleransi per segmen,
* membuat sling wire antar tiang,
* menomori dan mengelompokkan tiang per ukuran (7-2.5, 7-3, 7-4, 9-4).

Aturan penting: **setiap ujung kabel dan setiap titik balik kabel loopback pasti menjadi FAT.** Tiang di ujung kabel biasanya berdiri di jalan, sedikit di luar boundary yang mengelilingi rumah. Tool ini tetap menjadikannya FAT selama jaraknya masih wajar dari boundary terdekat.

## 4. KML to Database HP
[KML to Database HP](/dashboard/kml-database-hp) menyusun Excel HPDB **per FDT**: tray, port FDT, line, kapasitas kabel, warna tube, nomor core, FAT, port FAT, tiang FAT, serta alamat hasil geocoding. Alamat dicari **per FAT**, sehingga HP di jalan dan desa yang berbeda tidak lagi tercatat dengan alamat yang sama.

## 5. KML to BOQ
[KML to BOQ](/dashboard/kml-boq) mengisi template BoM/BoQ: panjang kabel per line dan kapasitas, sling wire, jumlah FAT, tiang per jenis, dan HP cover. Kabel atau FDT yang tidak punya tempat di template **dilaporkan**, bukan dibuang diam-diam.

## 6. KML to CAD
Tool terbaru, [KML to CAD](/dashboard/kml-cad), menggambar desain ke DXF AutoCAD sesuai template drafter. Simbol FAT/FDT dilengkapi kotak keterangan yang ditempatkan otomatis supaya tidak saling bertabrakan. Kabel digambar per kapasitas core, tiang per jenis lengkap dengan POLE ID, lalu kop dan tabel **DESIGN SUMMARY** terisi sendiri. Jumlah layout mengikuti jumlah FDT.

Ada dua pilihan:

| Pilihan | Keterangan |
| :--- | :--- |
| **Cluster** | Desain APD: FDT, FAT, boundary, kabel distribusi, tiang, sling |
| **SF / HF / MF** | Desain feeder: rute kabel, tiang, joint closure, slack hanger |
| **Dengan basic map** | Cluster: kotak rumah + jalan OSM dalam satu DXF. Feeder: tepi dan nama jalan |
| **Tanpa basic map** | Desainnya saja, lebih cepat |

## 7. Auto Coding APD
[Auto Coding APD](/dashboard/insert-coding) mengganti nama FDT, FAT, kabel, dan tiang baru sesuai kode proyek. Isi prefix untuk setiap FDT (FDT 01, FDT 02, dst.). Jumlah FDT tidak dibatasi.

## 8. Pole Auto-Sorter
Terakhir, [Pole Auto-Sorter](/dashboard/pole-sorter) merapikan penomoran tiang **menyusuri kabel distribusi dari FDT**, sekaligus menutup nomor yang bolong setelah ada tiang yang dihapus atau dipindah.

## Menyiapkan File supaya Mulus
Hampir semua masalah otomasi berawal dari struktur folder. Beberapa kebiasaan yang membuat semua tool di atas bekerja tanpa hambatan:
1. **Satu folder per LINE**, misalnya `LINE A FDT 01`. Nomor FDT di nama folder dipakai untuk memisahkan hitungan per FDT.
2. **Nama folder standar**: `BOUNDARY FAT`, `FAT`, `HP COVER`, `DISTRIBUTION CABLE`, `SLING WIRE`, `NEW POLE 7-3`, `EXISTING POLE EMR 7-4`.
3. **Kapasitas di nama kabel**, misalnya `CABLE LINE A (FO 24C/2T)`, supaya BOQ dan gambar CAD memakai layer yang benar.
4. **Selalu baca laporan hasil.** Peringatan seperti "boundary tanpa FAT" atau "kabel tidak masuk BOQ" jauh lebih murah diperbaiki di meja daripada di lapangan.

Dengan alur ini, pekerjaan yang biasanya makan beberapa hari bisa selesai dalam hitungan jam, dan setiap angka di BOQ, database HP, maupun gambar CAD berasal dari satu sumber data yang sama.
