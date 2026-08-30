import React from "react"
import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlCheckerPage() {
  return (
    <ToolPage
      title="KML Duplicate Checker"
      description="Detect duplicate HP and pole points across your KML files before they ship. Get a clean diff report with exact coordinates and recommended actions."
      acceptedFormats={[".kml", ".kmz"]}
      guide={{
        input:
          "Satu atau beberapa file KML/KMZ yang ingin diperiksa. Bisa diunggah sekaligus untuk dibandingkan silang.",
        steps: [
          "Unggah file KML yang ingin dicek.",
          "Atur jarak minimum bila perlu. Bawaannya 1 meter.",
          "Jalankan pengecekan, lalu baca laporannya.",
        ],
        output:
          "Laporan berisi daftar titik POLE dan HP yang bertumpuk atau terlalu berdekatan, lengkap dengan koordinat dan nama foldernya.",
      }}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      featureKey="kml_duplicate_checker"
    />
  )
}
