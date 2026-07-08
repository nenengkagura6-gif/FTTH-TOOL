import { ToolPage } from "@/components/dashboard/tool-page"

export default function AutoPlacemarkPage() {
  return (
    <ToolPage
      title="Auto Placemark Frontage"
      description="Unggah file boundary (KML/KMZ/GeoJSON) untuk otomatis menghasilkan titik placemark rumah di frontage (baris depan) jalan. Data bangunan dan jalan diambil dari OpenStreetMap."
      acceptedFormats={[".kml", ".kmz", ".geojson", ".json"]}
      primaryAccept=".kml,.kmz,.geojson,.json"
      supportsExcelTemplate={false}
      featureKey="kml_to_boq"
      toolName="auto_placemark"
      processingNotes={[
        "File boundary harus berisi polygon area (bukan titik atau garis). Pastikan koordinat dalam format WGS84 (lon/lat).",
        "Data bangunan dan jalan diambil dari OpenStreetMap/Overpass API. Jika data bangunan atau jalan di area Anda belum lengkap di OSM, hasilnya mungkin tidak optimal.",
        "Proses ini mungkin memakan waktu 30-120 detik tergantung luas area dan jumlah tile yang perlu di-query.",
        "Filter yang diterapkan: jarak maksimum ke jalan (25m), cek rumah terhalang bangunan lain, dan pemilihan baris pertama (first-row) per frontage jalan.",
        "Output hanya berisi titik placemark rumah yang lolos filter frontage. Nama file output mengikuti nama file input."
      ]}
    />
  )
}
