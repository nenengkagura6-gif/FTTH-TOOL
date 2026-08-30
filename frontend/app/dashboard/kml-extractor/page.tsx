import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlExtractorPage() {
  return (
    <ToolPage
      title="KML Extractor"
      description="Unggah berkas KML/KMZ Anda untuk mengekstrak dan menghitung jumlah elemen secara otomatis berdasarkan nama folder. Hasil ekstraksi akan dikonversi ke berkas Excel (.xlsx) dengan struktur tabel profesional."
      acceptedFormats={[".kml", ".kmz"]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      featureKey="kml_extractor"
      guide={{
        input:
          "File KML atau KMZ apa pun yang ingin dibongkar isinya.",
        steps: [
          "Unggah file KML/KMZ.",
          "Klik proses.",
          "Unduh Excel-nya untuk melihat rincian per folder.",
        ],
        output:
          "File Excel berisi seluruh elemen beserta koordinatnya, plus ringkasan jumlah per folder.",
      }}
    />
  )
}
