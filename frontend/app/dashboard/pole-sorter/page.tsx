import { ToolPage } from "@/components/dashboard/tool-page"

export const metadata = {
  title: "Pole Auto-Sorter | FTTH Tool",
  description:
    "Urutkan dan padatkan penomoran tiang New Pole dan Existing Pole secara otomatis. Upload KMZ → otomatis terurut rapi tanpa ada nomor yang bolong.",
}

export default function PoleSorterPage() {
  return (
    <ToolPage
      title="Pole Auto-Sorter"
      description="Upload file KMZ plan FTTH kamu dan biarkan tool ini mengurutkan dan memadatkan penomoran tiang (New Pole & Existing Pole) secara otomatis. Jika ada tiang yang terhapus dan membuat urutan nomor menjadi bolong, tool ini akan menutup bolong tersebut dengan melakukan re-numbering secara berurutan mulai dari 1."
      acceptedFormats={[".kml", ".kmz"]}
      processingNotes={[
        "Otomatis mendeteksi folder grup FDT/Line (contoh: LINE A FDT 01, FDT 02, dsb) secara otomatis, tidak peduli sedalam apapun struktur foldernya.",
        "Mendeteksi folder New Pole (new pole, np, tiang baru) dan Existing Pole (existing pole, eksisting, ext pole) di masing-masing grup FDT.",
        "Metode Pengurutan: Tiang diurutkan berdasarkan NOMOR yang sudah ada di nama Placemark masing-masing (contoh: P012).",
        "Penomoran Ulang: Setelah diurutkan, nomornya akan ditulis ulang dari awal secara padat (P001, P002, dst) untuk menutup lubang nomor.",
        "Penomoran bersifat GLOBAL lintas sub-folder di dalam grup FDT yang sama: New Pole 7-2.5 dan 9-4 berbagi satu urutan.",
        "New Pole dan Existing Pole diurutkan secara terpisah.",
        "Prefix awalan nama pole (misal MR.JBG01.P) otomatis dipertahankan.",
        "Struktur folder aslinya (serta isi non-pole seperti icon, style, kabel) sama sekali tidak diubah.",
        "Output berupa file KMZ siap upload ke Google Earth atau QGIS.",
      ]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      toolName="pole_sorter"
    />
  )
}
