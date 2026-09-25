import { ToolPage } from "@/components/dashboard/tool-page"

export const metadata = {
  title: "KML to CAD | FTTH Tool",
  description:
    "Gambar desain FTTH dari KML/KMZ ke DXF AutoCAD berbasis template drafter: desain APD cluster atau feeder (SF/HF/MF), kop dan DESIGN SUMMARY terisi otomatis, opsional plus basic map.",
}

export default function KmlCadPage() {
  return (
    <ToolPage
      title="KML to CAD"
      description="Unggah KML/KMZ desain FTTH untuk menghasilkan gambar DXF AutoCAD sesuai template drafter. Simbol FAT/FDT lengkap dengan kotak keterangan, kabel per kapasitas core, tiang per jenis beserta POLE ID, sling wire, serta kop dan tabel DESIGN SUMMARY yang terisi otomatis. Bisa sekaligus menyertakan basic map."
      acceptedFormats={[".kml", ".kmz"]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      featureKey="kml_to_boq"
      toolName="kml_to_cad"
      options={[
        {
          key: "jenis",
          label: "Jenis desain",
          type: "choice",
          defaultValue: "cluster",
          choices: [
            {
              value: "cluster",
              label: "Cluster",
              hint: "Desain APD: FDT, FAT, boundary, kabel distribusi, tiang, sling.",
            },
            {
              value: "feeder",
              label: "SF / HF / MF",
              hint: "Desain feeder: rute kabel, tiang, joint closure, slack hanger.",
            },
          ],
        },
        {
          key: "basicmap",
          label: "Sertakan basic map",
          type: "choice",
          defaultValue: "true",
          choices: [
            {
              value: "true",
              label: "Ya, full",
              hint: "Cluster: kotak & nomor rumah + jalan OSM. Feeder: tepi & nama jalan OSM.",
            },
            {
              value: "false",
              label: "Tidak",
              hint: "Desainnya saja — lebih cepat, tanpa data OpenStreetMap.",
            },
          ],
        },
        {
          key: "homepass",
          label: "Total homepass (opsional)",
          type: "number",
          placeholder: "Contoh: 180",
          hint: "KMZ feeder tidak memuat jumlah homepass; isi kalau baris TOTAL HOMEPASS perlu diisi.",
          showWhen: { key: "jenis", value: "feeder" },
        },
        {
          key: "hub",
          label: "Nama Hub / OLT (opsional)",
          type: "text",
          placeholder: "Contoh: GEBANG",
          hint: "Mengisi kolom Nama Rencana Hub / OLT di kop gambar.",
          showWhen: { key: "jenis", value: "feeder" },
        },
      ]}
      secondaryUpload={{
        label: "CSV nama jalan dari proses sebelumnya (opsional)",
        buttonLabel: "Tambah _jalan.csv yang sudah diisi",
        accept: ".csv",
        showWhen: { key: "basicmap", value: "true" },
      }}
      guide={{
        input:
          "Cluster: KML/KMZ hasil desain APD (jalankan KML To APD lebih dulu) — folder FDT, FAT, BOUNDARY FAT, DISTRIBUTION CABLE, SLING WIRE, NEW POLE / EXISTING POLE per ukuran, HP COVER. Feeder: folder CABLE, JOINT CLOSURE, SLACK HANGER, dan folder tiang.",
        steps: [
          "Pilih jenis desain: Cluster atau SF/HF/MF.",
          "Pilih apakah basic map ikut digambar. Dengan basic map prosesnya lebih lama karena mengambil data jalan dari OpenStreetMap.",
          "Unggah file KML/KMZ, lalu klik proses.",
          "Unduh ZIP-nya dan buka file _laporan.txt lebih dulu — di situ tertulis folder yang dilewati dan hal yang perlu diperiksa.",
          "Jalan yang belum bernama bisa diisi di kolom 'nama_dipakai' file _jalan.csv, lalu proses ulang dengan CSV itu diunggah.",
        ],
        output:
          "File ZIP berisi gambar DXF AutoCAD (koordinat UTM, 1 unit = 1 meter, satu layout per FDT), daftar jalan dalam CSV bila basic map disertakan, dan catatan proses dalam TXT.",
      }}
    />
  )
}
