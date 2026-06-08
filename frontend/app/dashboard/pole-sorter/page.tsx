import { ToolPage } from "@/components/dashboard/tool-page"

export const metadata = {
  title: "Pole Auto-Sorter | FTTH Tool",
  description:
    "Urutkan penomoran tiang New Pole dan Existing Pole secara otomatis berdasarkan posisi kabel dari FDT. Upload KMZ → otomatis terurut sempurna.",
}

export default function PoleSorterPage() {
  return (
    <ToolPage
      title="Pole Auto-Sorter"
      description="Upload file KMZ plan FTTH kamu dan biarkan tool ini mengurutkan penomoran tiang (New Pole & Existing Pole) secara otomatis berdasarkan posisi fisik di sepanjang kabel, dimulai dari FDT — tanpa perlu mengurutkan manual satu per satu."
      acceptedFormats={[".kml", ".kmz"]}
      processingNotes={[
        "Otomatis mendeteksi folder New Pole (new pole, np, tiang baru) dan Existing Pole (existing pole, eksisting, ext pole) dari semua lapisan folder.",
        "Urutan penomoran berdasarkan posisi fisik tiang di sepanjang kabel — dimulai dari titik FDT.",
        "Cabang kabel (sling wire) dihabiskan lebih dulu sebelum melanjutkan ke kabel utama (DFS traversal).",
        "Penomoran bersifat GLOBAL lintas sub-folder: New Pole 7-2.5 dan 9-4 berbagi satu urutan (P001, P002...).",
        "New Pole dan Existing Pole diurutkan secara terpisah, masing-masing mulai dari P001.",
        "Mendukung beberapa FDT: setiap grup Line A FDT 01, Line B FDT 02, dst. diurutkan secara mandiri.",
        "Prefix nama pole (misal MR.JBG01.P) dipertahankan — hanya nomornya yang berubah.",
        "Jika kabel tidak ditemukan, pengurutan menggunakan nama placemark yang sudah ada sebagai fallback.",
        "Struktur folder dan isi non-pole (icon, style, kabel, FDT) tidak diubah.",
        "Output berupa file KMZ siap upload ke Google Earth atau QGIS.",
      ]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      toolName="pole_sorter"
    />
  )
}
