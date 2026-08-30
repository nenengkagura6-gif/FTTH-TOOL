import { ToolPage } from "@/components/dashboard/tool-page"

export const metadata = {
  title: "KML - APD | FTTH Tool",
  description:
    "Auto-draft KML/KMZ untuk FTTH: generate FAT, deskripsi kabel, sling wire, HP coverage, penomoran pole, dan style Google Earth secara otomatis.",
}

export default function KmlApdPage() {
  return (
    <ToolPage
      title="KML - APD"
      description="Upload file KML/KMZ plan FTTH Anda dan biarkan tool ini menghasilkan desain APD secara otomatis. Tool ini menyusun boundary, menempatkan FAT, menghitung kebutuhan kabel beserta toleransinya, membuat sling wire, memetakan jaringan HP, menomori tiang, serta menginjeksi style Google Earth untuk visualisasi yang rapi dan standar."
      acceptedFormats={[".kml", ".kmz"]}
      guide={{
        input:
          "File KML atau KMZ berisi elemen FAT, kabel, tiang, dan homepass.",
        steps: [
          "Unggah file KML/KMZ hasil desain.",
          "Klik proses dan tunggu sampai selesai.",
          "Unduh hasilnya untuk diperiksa sebelum diserahkan.",
        ],
        output:
          "File KML yang sudah tertata ulang: FAT, kabel, tiang, dan HP dikelompokkan sesuai struktur APD.",
      }}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      toolName="kml_apd"
      featureKey="kml_to_boq"
    />
  )
}
