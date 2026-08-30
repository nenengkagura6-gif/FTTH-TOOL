import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlDatabaseHpPage() {
  return (
    <ToolPage
      title="KML to Database HP"
      description="Convert KML homepass data into a structured, normalized database. Consistent IDs, validated coordinates, and ready-to-import CSV/XLSX output."
      acceptedFormats={[".kml", ".kmz", ".xlsx"]}
      guide={{
        input:
          "File KML atau KMZ berisi folder FDT, LINE, dan HP COVER. Template APD HPDB opsional.",
        steps: [
          "Pastikan titik FDT berada di dalam folder bernama FDT.",
          "Unggah file KML/KMZ.",
          "Tunggu proses selesai. Alamat tiap titik diambil otomatis, jadi file dengan ratusan HP butuh beberapa menit.",
          "Periksa hasilnya, terutama kolom kecamatan dan koordinat FDT.",
        ],
        output:
          "File Excel HPDB siap unggah, satu sheet per FDT, lengkap dengan alamat, koordinat, dan pemetaan core.",
      }}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate
      featureKey="kml_to_database"
    />
  )
}
