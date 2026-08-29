/**
 * Tutorial data for all tools.
 * 
 * HOW TO ADD A VIDEO:
 * 1. Upload your tutorial to YouTube
 * 2. Copy the Video ID from the URL: youtube.com/watch?v=**VIDEO_ID_HERE**
 * 3. Paste it into the `youtubeId` field for the matching tool below
 * 4. Optionally add a `sampleFileUrl` (Google Drive or direct link)
 * 
 * Tools without a youtubeId will NOT show a Tutorial tab — safe to leave empty.
 */

import type { ToolCategory } from "@/lib/site-config"

export interface TutorialStep {
  title: string
  description: string
}

export interface TutorialEntry {
  /** Must match the tool's href slug, e.g. "kml-boq" */
  toolSlug: string
  toolTitle: string
  toolTitleId: string
  category: ToolCategory
  youtubeId: string          // Leave empty string "" if no video yet
  sampleFileUrl?: string     // Optional: Google Drive or direct download URL
  /** Written step-by-step guide shown alongside the video */
  steps: TutorialStep[]
  stepsTitleId?: string      // Indonesian title override for steps section
}

export const TUTORIAL_DATA: TutorialEntry[] = [
  // ── Drafter / Survey ──────────────────────────────────────────
  {
    toolSlug: "kml-boq",
    toolTitle: "KML to BOQ",
    toolTitleId: "KML ke BOQ",
    category: "survey",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Upload File KML/KMZ", description: "Seret dan lepas atau klik area upload untuk memilih file KML atau KMZ dari proyek Anda." },
      { title: "Pilih Template Excel (Opsional)", description: "Jika Anda memiliki template Excel kustom, upload pada bagian template opsional." },
      { title: "Klik Process", description: "Tekan tombol Process dan tunggu sistem memproses file Anda." },
      { title: "Download Hasil BOQ", description: "Setelah selesai, klik Download untuk mengunduh file Excel Bill of Quantities." },
    ],
  },
  {
    toolSlug: "kml-database-hp",
    toolTitle: "KML to Database HP",
    toolTitleId: "KML ke Database HP",
    category: "survey",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Siapkan File KML/KMZ", description: "Pastikan file KML berisi data titik HP (Home Passed) yang sudah diberi nama dengan benar." },
      { title: "Upload File", description: "Upload file KML/KMZ Anda ke area drop zone." },
      { title: "Proses Konversi", description: "Klik Process untuk memulai konversi ke format database HP." },
      { title: "Download Excel", description: "Download file Excel berisi database HP yang siap digunakan." },
    ],
  },
  {
    toolSlug: "kml-extractor",
    toolTitle: "KML Extractor",
    toolTitleId: "Ekstraktor KML",
    category: "survey",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Upload KML/KMZ", description: "Upload file KML/KMZ yang berisi elemen-elemen yang ingin diekstrak." },
      { title: "Proses Ekstraksi", description: "Klik Process — sistem akan menghitung dan merangkum semua elemen per folder." },
      { title: "Download Ringkasan Excel", description: "Unduh file Excel yang berisi ringkasan jumlah elemen per folder." },
    ],
  },
  {
    toolSlug: "pole-sorter",
    toolTitle: "Pole Auto-Sorter",
    toolTitleId: "Pengurut Tiang Otomatis",
    category: "survey",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Siapkan File KML", description: "Pastikan file KML berisi data tiang (New Pole & Existing Pole) dengan penamaan yang sesuai." },
      { title: "Upload File KML", description: "Upload file KML/KMZ ke area upload." },
      { title: "Proses Sorting", description: "Klik Process untuk mengurutkan penomoran tiang secara otomatis berdasarkan posisi kabel dari FDT." },
      { title: "Download Hasil", description: "Download file KML dengan penomoran tiang yang sudah terurut." },
    ],
  },
  {
    toolSlug: "insert-coding",
    toolTitle: "Insert Coding KML",
    toolTitleId: "Insert Coding KML",
    category: "survey",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Upload KML/KMZ", description: "Upload file KML/KMZ yang berisi FDT, FAT, Kabel, dan New Pole." },
      { title: "Proses Auto-Rename", description: "Sistem akan otomatis merename semua elemen sesuai standar coding." },
      { title: "Download Hasil", description: "Download file KML/KMZ dengan coding yang sudah diinsert." },
    ],
  },
  {
    toolSlug: "kml-apd",
    toolTitle: "KML - APD",
    toolTitleId: "KML - APD",
    category: "survey",
    youtubeId: "41SwZBErwcQ",
    steps: [
      { title: "Upload File KML", description: "Upload file KML dasar proyek Anda." },
      { title: "Konfigurasi Output", description: "Sistem akan auto-draft: FAT, kabel, sling wire, HP coverage, penomoran tiang & styles." },
      { title: "Proses APD", description: "Klik Process dan tunggu sistem membuat draft APD lengkap." },
      { title: "Download KML APD", description: "Download file KML APD yang siap digunakan." },
    ],
  },
  {
    toolSlug: "auto-placemark",
    toolTitle: "Auto Tagging HP",
    toolTitleId: "Auto Tagging HP",
    category: "survey",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Upload File Boundary KML", description: "Upload file KML yang berisi boundary area proyek Anda." },
      { title: "Proses Generate HP", description: "Sistem akan mengambil data bangunan & jalan dari OSM dan membuat placemark HP otomatis." },
      { title: "Download KML HP", description: "Download file KML berisi placemark HP yang sudah digenerate." },
    ],
  },

  // ── Format Conversion ──────────────────────────────────────────
  {
    toolSlug: "kml-csv",
    toolTitle: "KML to CSV",
    toolTitleId: "KML ke CSV",
    category: "conversion",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Upload KML/KMZ", description: "Upload file KML/KMZ yang berisi data titik (Point placemark)." },
      { title: "Proses Konversi", description: "Klik Process untuk mengekstrak semua titik ke format CSV." },
      { title: "Download CSV", description: "Download file CSV yang berisi koordinat dan atribut semua titik." },
    ],
  },
  {
    toolSlug: "kml-shp",
    toolTitle: "KML to Shapefile",
    toolTitleId: "KML ke Shapefile",
    category: "conversion",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Upload KML/KMZ", description: "Upload file KML/KMZ berisi layer jaringan yang ingin dikonversi." },
      { title: "Proses ke Shapefile", description: "Klik Process untuk mengkonversi ke format ESRI Shapefile." },
      { title: "Download ZIP Shapefile", description: "Download file ZIP berisi semua komponen shapefile (.shp, .dbf, .prj, dll)." },
    ],
  },
  {
    toolSlug: "shp-kml",
    toolTitle: "Shapefile to KML",
    toolTitleId: "Shapefile ke KML",
    category: "conversion",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Siapkan File ZIP", description: "Kompres file shapefile Anda (.shp, .dbf, minimal) ke dalam satu file ZIP." },
      { title: "Upload ZIP", description: "Upload file ZIP shapefile ke area upload." },
      { title: "Download KML/KMZ", description: "Download file KML/KMZ hasil konversi." },
    ],
  },
  {
    toolSlug: "kml-dxf",
    toolTitle: "KML to AutoCAD (DXF)",
    toolTitleId: "KML ke AutoCAD (DXF)",
    category: "conversion",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Upload KML/KMZ", description: "Upload file KML/KMZ berisi desain vektor yang ingin dikonversi ke AutoCAD." },
      { title: "Proses ke DXF", description: "Klik Process untuk mengkonversi ke format DXF AutoCAD." },
      { title: "Download DXF", description: "Download file DXF yang bisa dibuka di AutoCAD atau aplikasi CAD lainnya." },
    ],
  },
  {
    toolSlug: "dxf-kml",
    toolTitle: "AutoCAD (DXF) to KML",
    toolTitleId: "AutoCAD (DXF) ke KML",
    category: "conversion",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Export DXF dari AutoCAD", description: "Export gambar AutoCAD Anda ke format DXF (pastikan skala dalam meter)." },
      { title: "Upload File DXF", description: "Upload file DXF ke area upload." },
      { title: "Download KML/KMZ", description: "Download file KML/KMZ hasil konversi." },
    ],
  },
  {
    toolSlug: "kml-checker",
    toolTitle: "KML Duplicate Checker",
    toolTitleId: "Pendeteksi Duplikat KML",
    category: "conversion",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Upload KML/KMZ", description: "Upload file KML/KMZ yang ingin diperiksa untuk duplikat." },
      { title: "Proses Pengecekan", description: "Klik Process — sistem akan mendeteksi titik HP dan tiang yang duplikat." },
      { title: "Review Laporan", description: "Download laporan Excel berisi daftar semua duplikat yang ditemukan." },
    ],
  },

  // ── Measurement & Testing ──────────────────────────────────────
  {
    toolSlug: "otdr-analyzer",
    toolTitle: "OTDR Trace Analyzer",
    toolTitleId: "Penganalisis Trace OTDR",
    category: "measurement",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Upload File SOR", description: "Upload file trace OTDR dalam format .sor dari alat OTDR Anda." },
      { title: "Analisis Otomatis", description: "Sistem akan menganalisis event, jarak, dan loss dari trace OTDR." },
      { title: "Review Hasil", description: "Lihat ringkasan event dan grafik trace yang sudah dianalisis." },
      { title: "Download Laporan", description: "Download laporan analisis dalam format yang diinginkan." },
    ],
  },
  {
    toolSlug: "otdr-fault-locator",
    toolTitle: "OTDR Distance-to-Fault",
    toolTitleId: "Lokasi Putus Kabel OTDR",
    category: "measurement",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Masukkan Jarak OTDR", description: "Input jarak titik putus yang terbaca pada alat OTDR Anda." },
      { title: "Upload Rute Kabel (KML)", description: "Upload file KML yang berisi rute jalur kabel optik." },
      { title: "Lihat Lokasi di Peta", description: "Sistem akan menghitung dan menampilkan estimasi lokasi fisik titik putus pada peta." },
    ],
  },
  {
    toolSlug: "opm-calculator",
    toolTitle: "OPM Link Budget",
    toolTitleId: "Kalkulator OPM Link Budget",
    category: "measurement",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Input Parameter Jaringan", description: "Masukkan panjang kabel, jumlah splitter, konektor, dan parameter lainnya." },
      { title: "Hitung Link Budget", description: "Klik Calculate untuk menghitung total loss dan power budget." },
      { title: "Review Hasil", description: "Cek apakah power yang diterima di ONU masih dalam batas toleransi." },
    ],
  },
  {
    toolSlug: "fiber-color-code",
    toolTitle: "Fiber Color Code",
    toolTitleId: "Kode Warna Fiber",
    category: "measurement",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Pilih Standar", description: "Pilih standar kode warna yang digunakan: TIA-598-C atau Telkom." },
      { title: "Masukkan Nomor Tube/Core", description: "Input nomor tube dan core yang ingin dicari kodenya." },
      { title: "Lihat Kode Warna", description: "Sistem menampilkan kombinasi warna tube dan core secara visual." },
    ],
  },

  // ── Utility ───────────────────────────────────────────────────
  {
    toolSlug: "splice-manager",
    toolTitle: "Splice Manager",
    toolTitleId: "Manajemen Splicing",
    category: "utility",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Konfigurasi Kabel", description: "Input jumlah tube, core per tube, dan kabel yang terlibat dalam splicing." },
      { title: "Generate Tabel Splicing", description: "Klik Generate untuk membuat tabel distribusi core splicing." },
      { title: "Download Tabel", description: "Download tabel splicing dalam format Excel." },
    ],
  },
  {
    toolSlug: "gpon-splitter-estimator",
    toolTitle: "GPON Splitter Estimator",
    toolTitleId: "Estimator Splitter GPON",
    category: "utility",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Input Konfigurasi Splitter", description: "Masukkan konfigurasi splitter: ratio, cascading, dan jalur daisy chain." },
      { title: "Hitung Loss", description: "Klik Calculate untuk menghitung total optical loss di setiap jalur." },
      { title: "Review Budget", description: "Pastikan loss total masih dalam batas link budget yang diizinkan." },
    ],
  },
  {
    toolSlug: "dms-dd-converter",
    toolTitle: "DMS ↔ DD Converter",
    toolTitleId: "Konverter DMS ↔ DD",
    category: "utility",
    youtubeId: "",  // TODO: isi dengan ID video YouTube Anda
    steps: [
      { title: "Pilih Mode Konversi", description: "Pilih antara DMS ke DD atau DD ke DMS." },
      { title: "Input Koordinat", description: "Masukkan koordinat tunggal atau batch (beberapa koordinat sekaligus)." },
      { title: "Lihat Hasil", description: "Hasil konversi ditampilkan langsung dan siap disalin." },
    ],
  },
]

/** Get tutorial entry by tool slug */
export function getTutorialBySlug(slug: string): TutorialEntry | undefined {
  return TUTORIAL_DATA.find((t) => t.toolSlug === slug)
}

/** Get all tutorials that have a YouTube video assigned */
export function getTutorialsWithVideo(): TutorialEntry[] {
  return TUTORIAL_DATA.filter((t) => t.youtubeId && t.youtubeId.length > 0)
}

/** Get tutorials by category */
export function getTutorialsByCategory(category: ToolCategory): TutorialEntry[] {
  return TUTORIAL_DATA.filter((t) => t.category === category)
}
