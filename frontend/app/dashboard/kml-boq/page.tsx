import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlBoqPage() {
  return (
    <ToolPage
      title="KML to BOQ"
      description="Generate a Bill of Quantities directly from your KML/KMZ files. Cable lengths, splitters, poles, and accessories tallied automatically."
      acceptedFormats={[".kml", ".kmz", ".xlsx"]}
      guide={{
        input:
          "File KML atau KMZ hasil desain jaringan. Bisa disertai template BOQ Excel sendiri; kalau tidak, template bawaan yang dipakai.",
        steps: [
          "Pastikan folder di KML tertata rapi: nama LINE dan FDT mengikuti penamaan standar.",
          "Unggah file KML/KMZ. Tambahkan template Excel bila punya format sendiri.",
          "Klik proses, lalu tunggu sampai selesai.",
        ],
        output:
          "File Excel BOQ berisi rekap panjang kabel per jenis, jumlah FAT, dan jumlah tiang, terpisah per FDT.",
      }}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate
      featureKey="kml_to_boq"
    />
  )
}
