import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlShpPage() {
  return (
    <ToolPage
      title="KML to Shapefile"
      description="Convert your KML/KMZ maps into ESRI Shapefiles (SHP) compatible with professional GIS systems like QGIS and ArcGIS."
      acceptedFormats={[".kml", ".kmz"]}
      guide={{
        input:
          "File KML atau KMZ berisi titik, garis, atau polygon.",
        steps: [
          "Unggah file KML/KMZ.",
          "Klik proses dan tunggu sampai selesai.",
          "Unduh arsip ZIP-nya, lalu ekstrak sebelum dibuka di QGIS atau ArcGIS.",
        ],
        output:
          "Arsip ZIP berisi satu set Shapefile lengkap (.shp, .shx, .dbf, .prj) dengan proyeksi WGS84.",
      }}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      toolName="kml_to_shp"
    />
  )
}
