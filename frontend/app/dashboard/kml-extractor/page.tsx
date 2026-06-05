import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlExtractorPage() {
  return (
    <ToolPage
      title="KML Folder Extractor"
      description="Unggah berkas KML/KMZ Anda untuk mengekstrak dan menghitung jumlah elemen secara otomatis berdasarkan nama folder. Hasil ekstraksi akan dikonversi ke berkas Excel (.xlsx) dengan struktur tabel profesional."
      acceptedFormats={[".kml", ".kmz"]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      featureKey="kml_folder_extractor"
      processingNotes={[
        "Elemen titik (Placemark Point), area (Polygon), dan rute (LineString) dihitung secara rekursif per subfolder.",
        "Folder dengan nama yang sama di seluruh dokumen akan secara otomatis diakumulasikan totalnya.",
        "Folder yang mengandung kata 'CABLE' atau 'KABEL' akan memisahkan baris perhitungan rute per nama/tipe kabel individual.",
        "Total panjang rute (LineString) dihitung menggunakan perhitungan geodesic bumi presisi tinggi dalam meter dan kilometer."
      ]}
    />
  )
}
