import { ToolPage } from "@/components/dashboard/tool-page"

export const metadata = {
  title: "BasicMap | FTTH Tool",
  description:
    "Ubah KML/KMZ survei FTTH jadi basic map DXF AutoCAD: kotak rumah sejajar jalan, nomor rumah, tepi jalan dari OpenStreetMap, tiang, dan kop VALIDASI yang terisi otomatis.",
}

export default function BasicMapPage() {
  return (
    <ToolPage
      title="BasicMap"
      description="Unggah KML/KMZ survei FTTH untuk menghasilkan basic map DXF AutoCAD. Setiap titik HP jadi kotak rumah yang menghadap jalan, sejajar dengan tetangganya, dan tidak saling tumpang tindih. Tepi jalan dan nama jalan diambil dari OpenStreetMap, tiang digambar dengan blok NP7, dan kop layout VALIDASI diisi otomatis."
      acceptedFormats={[".kml", ".kmz"]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      secondaryUpload={{
        label: "CSV nama jalan dari proses sebelumnya (opsional)",
        buttonLabel: "Tambah _jalan.csv yang sudah diisi",
        accept: ".csv",
      }}
      featureKey="kml_to_boq"
      toolName="basicmap"
      guide={{
        input:
          "File KML/KMZ hasil survei. Folder HP / HP COVER / HP UNCOVER / HOMEPASS dibaca sebagai rumah, folder POLE / TIANG / NP / EXT dibaca sebagai tiang. Koordinatnya WGS84.",
        steps: [
          "Unggah file KML atau KMZ survei Anda.",
          "Tunggu prosesnya. Tepi jalan diambil dari OpenStreetMap, jadi lamanya tergantung luas cluster.",
          "Unduh hasilnya, lalu buka file _laporan.txt lebih dulu — di situ tertulis apa saja yang masih perlu diperiksa tangan.",
          "Jalan yang tidak ada di OpenStreetMap tidak punya nama. Isi kolom 'nama_dipakai' di file _jalan.csv, lalu proses ulang KML yang sama dengan CSV itu diunggah di kolom 'CSV nama jalan' supaya namanya ikut tergambar.",
        ],
        output:
          "File ZIP berisi tiga berkas: gambar DXF AutoCAD tergeoreferensi (1 unit = 1 meter), daftar ruas jalan dalam CSV, dan catatan proses dalam TXT.",
      }}
    />
  )
}
