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
      guide={{
        input:
          "File boundary berisi polygon area cluster (.kml, .kmz, .geojson). Bukan titik atau garis, dan koordinatnya WGS84.",
        steps: [
          "Gambar polygon batas cluster di Google Earth, lalu simpan sebagai KML atau KMZ.",
          "Unggah file boundary tersebut di sini.",
          "Tunggu proses selesai. Data bangunan dan jalan diambil dari OpenStreetMap, jadi lamanya tergantung luas area.",
          "Unduh hasilnya dan buka di Google Earth untuk diperiksa.",
        ],
        output:
          "File KML berisi titik placemark rumah di baris depan jalan, sudah tersaring otomatis. Nama file mengikuti file masukan.",
      }}
    />
  )
}
