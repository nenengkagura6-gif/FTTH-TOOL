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
      description="Upload file KMZ plan FTTH kamu dan biarkan tool ini menomori ulang tiang (New Pole & Existing Pole) secara otomatis. Tiang diurutkan menyusuri kabel distribusi mulai dari FDT; tiang yang tidak berada di jalur kabel (atau grup tanpa kabel) diurutkan menurut nomor lamanya. Nomor yang bolong ikut dirapatkan, mulai dari 1."
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
          "File KMZ dengan tiang yang sudah diurutkan sepanjang jalur kabel, siap dipakai untuk penomoran lapangan.",
      }}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      featureKey="kml_to_boq"
      toolName="pole_sorter"
    />
  )
}
