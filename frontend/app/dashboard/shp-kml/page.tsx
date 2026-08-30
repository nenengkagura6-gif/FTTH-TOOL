import { ToolPage } from "@/components/dashboard/tool-page"

export default function ShpKmlPage() {
  return (
    <ToolPage
      title="Shapefile to KML"
      description="Convert your ESRI Shapefile archives back into Google Earth KML format for easy visualization."
      acceptedFormats={[".zip"]}
      guide={{
        input:
          "Arsip ZIP berisi satu set Shapefile lengkap. Minimal ada .shp, .shx, dan .dbf di dalam satu ZIP.",
        steps: [
          "Kumpulkan seluruh berkas Shapefile ke dalam satu ZIP.",
          "Unggah ZIP tersebut.",
          "Unduh hasilnya dan buka di Google Earth.",
        ],
        output:
          "File KML yang bisa langsung dibuka di Google Earth, dengan atribut Shapefile ikut terbawa.",
      }}
      primaryAccept=".zip"
      supportsExcelTemplate={false}
      toolName="shp_to_kml"
    />
  )
}
