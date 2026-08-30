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
      guide={{
        input:
          "File KML atau KMZ berisi folder tiang dan jalur kabel distribusi.",
        steps: [
          "Pastikan jalur kabel dan titik tiang berada di file yang sama.",
          "Unggah file KML/KMZ.",
          "Unduh hasilnya. Urutan tiang sudah mengikuti arah kabel.",
        ],
        output:
          "File KML dengan tiang yang sudah diurutkan sepanjang jalur kabel, siap dipakai untuk penomoran lapangan.",
      }}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      toolName="pole_sorter"
    />
  )
}
