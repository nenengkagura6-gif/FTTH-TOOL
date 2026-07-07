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
      description="Upload file KML/KMZ plan FTTH Anda dan biarkan tool ini menghasilkan desain APD secara otomatis. Tool ini memproses boundary FAT, menempatkan FAT pada tiang terdekat, menghitung deskripsi kabel (route, slack, toleransi), membuat sling wire antar tiang, memetakan HP ke boundary polygon, menomori dan mengklasifikasi tiang (new/existing, ukuran), serta menginjeksi style Google Earth untuk visualisasi yang rapi."
      acceptedFormats={[".kml", ".kmz"]}
      processingNotes={[
        "Boundary polygon di setiap LINE akan diberi nama otomatis (A01, A02, B01, dst) berdasarkan huruf LINE.",
        "HP dari folder root 'HP' akan dipindahkan ke subfolder HP COVER per-boundary, atau HP UNCOVER jika tidak masuk boundary manapun.",
        "FAT ditempatkan otomatis pada tiang yang paling dekat ke centroid boundary dan berada di jalur distribusi.",
        "Deskripsi kabel dihitung otomatis: Total Route + Slack (FDT + FAT @20m) + Toleransi 3%.",
        "Kapasitas FO otomatis ditentukan: ≤10 boundary → 24C/2T, ≤15 → 36C/3T, >15 → 48C/4T.",
        "Sling wire dibuat otomatis menghubungkan tiang yang tidak terlayani kabel ke tiang terdekat (maks 60m).",
        "Penomoran tiang global berurutan dari FDT: New Pole (MR.XXX.P001, dst) dan Existing (EXT.MR.P001, dst).",
        "Klasifikasi ukuran tiang otomatis: FDT → 7-4, FAT/loopback/belokan tajam → 7-3, lainnya → 7-2.5 / sesuai deskripsi.",
        "Folder di setiap LINE diurutkan ulang: Boundary → FAT → HP Cover → Pole → Cable → Slack → Sling Wire.",
        "Style Google Earth diinjeksi untuk warna icon/garis yang seragam sesuai legenda standar.",
        "Tiang duplikat dalam radius 10m otomatis dihapus (prioritas existing pole).",
        "Output berupa file KML/KMZ siap buka di Google Earth.",
      ]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      toolName="kml_apd"
      featureKey="kml_to_boq"
    />
  )
}
