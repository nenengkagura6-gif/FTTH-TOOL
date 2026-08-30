import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlDxfPage() {
  return (
    <ToolPage
      title="KML to AutoCAD (DXF)"
      description="Convert your Google Earth KML/KMZ maps into a 100% precise AutoCAD DXF drawing file, complete with layers, colors, and correct metric UTM projections."
      acceptedFormats={[".kml", ".kmz"]}
      guide={{
        input:
          "File KML atau KMZ berisi titik, garis, atau polygon.",
        steps: [
          "Unggah file KML/KMZ.",
          "Klik proses. Zona UTM ditentukan otomatis dari posisi datanya.",
          "Unduh DXF-nya dan buka di AutoCAD.",
        ],
        output:
          "File DXF dengan koordinat metrik UTM. Tiap jenis elemen dipisah ke layer sendiri dan diberi warna.",
      }}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      toolName="kml_to_dxf"
    />
  )
}
