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
      processingNotes={[
        "Boundary polygon, FAT, dan Homepass (HP) diproses dan dikelompokkan secara otomatis.",
        "Kebutuhan kabel distribusi dihitung dan ditentukan secara otomatis beserta nilai toleransinya.",
        "Kapasitas core kabel fiber optik (FO) dan spesifikasi ukurannya disesuaikan otomatis dengan desain.",
        "Sling wire (kabel udara) dibuat otomatis untuk menghubungkan antar tiang.",
        "Setiap tiang akan dinomori ulang dan diklasifikasikan berdasarkan standar (New/Existing).",
        "Penataan folder struktur KML dan pewarnaan (style) Google Earth diseragamkan sesuai standar.",
        "Output berupa file KML/KMZ yang rapi dan siap untuk dibuka di Google Earth.",
      ]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      toolName="kml_apd"
      featureKey="kml_to_boq"
    />
  )
}
