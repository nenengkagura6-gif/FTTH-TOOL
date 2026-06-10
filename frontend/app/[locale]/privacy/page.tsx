import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { LegalContent, type LegalSection } from "@/components/site/legal-layout"

interface PageProps {
  params: Promise<{
    locale: string
  }>
}

const sectionsEn: LegalSection[] = [
  {
    id: "data-collection",
    title: "1. Data collection",
    body: [
      "We collect only the information necessary to operate the platform: account details (email, name), workspace settings, and metadata about uploaded files.",
      "We do not sell, rent, or share your personal information with third parties for marketing purposes.",
    ],
  },
  {
    id: "file-processing",
    title: "2. File processing",
    body: [
      "Files you upload (KML, KMZ, XLSX) are processed inside isolated workers. Processing logs include only the filename, size, and timing — never the content.",
      "Outputs are encrypted at rest and accessible only to your account.",
    ],
  },
  {
    id: "temporary-uploads",
    title: "3. Temporary uploads",
    body: [
      "Uploaded files are retained for 24 hours by default and then permanently deleted. Pro accounts can configure shorter retention.",
      "We never use your files to train any models.",
    ],
  },
  {
    id: "cookies",
    title: "4. Cookies",
    body: [
      "We use a minimal set of essential cookies for authentication and session management.",
      "Cookie analytics are only set with your consent and are anonymized.",
    ],
  },
  {
    id: "security",
    title: "5. Security",
    body: [
      "All data is encrypted in transit via TLS 1.2+ and at rest via AES-256.",
      "We follow the principle of least privilege internally and audit access regularly.",
    ],
  },
  {
    id: "third-parties",
    title: "6. Third-party services",
    body: [
      "We use trusted infrastructure partners (cloud hosting, email delivery, analytics). All partners are bound by data processing agreements.",
      "A full list of subprocessors is available on request.",
    ],
  },
  {
    id: "advertising",
    title: "7. Advertising",
    body: [
      "Some pages of our public website may show display advertising. Ad networks may set their own cookies, governed by their privacy policies.",
      "Authenticated dashboard pages never show third-party ads.",
    ],
  },
  {
    id: "user-rights",
    title: "8. Your rights",
    body: [
      "You can access, export, or delete your data at any time from your dashboard settings.",
      "For GDPR or CCPA requests, contact privacy@ftthtools.my.id.",
    ],
  },
]

const sectionsId: LegalSection[] = [
  {
    id: "data-collection",
    title: "1. Pengumpulan data",
    body: [
      "Kami hanya mengumpulkan informasi yang diperlukan untuk mengoperasikan platform: detail akun (email, nama), pengaturan ruang kerja, dan metadata tentang file yang diunggah.",
      "Kami tidak menjual, menyewakan, atau membagikan informasi pribadi Anda kepada pihak ketiga untuk tujuan pemasaran.",
    ],
  },
  {
    id: "file-processing",
    title: "2. Pemrosesan file",
    body: [
      "File yang Anda unggah (KML, KMZ, XLSX) diproses di dalam worker yang terisolasi. Log pemrosesan hanya mencakup nama file, ukuran, dan waktu — tidak pernah isinya.",
      "Output dienkripsi saat istirahat (at rest) dan hanya dapat diakses oleh akun Anda.",
    ],
  },
  {
    id: "temporary-uploads",
    title: "3. Unggahan sementara",
    body: [
      "File yang diunggah disimpan selama 24 jam secara default dan kemudian dihapus secara permanen. Akun Pro dapat mengonfigurasi retensi yang lebih singkat.",
      "Kami tidak pernah menggunakan file Anda untuk melatih model apa pun.",
    ],
  },
  {
    id: "cookies",
    title: "4. Cookie",
    body: [
      "Kami menggunakan kumpulan minimal cookie esensial untuk autentikasi dan manajemen sesi.",
      "Cookie analitik hanya disetel dengan persetujuan Anda dan dianonimkan.",
    ],
  },
  {
    id: "security",
    title: "5. Keamanan",
    body: [
      "Semua data dienkripsi dalam transit via TLS 1.2+ dan saat istirahat (at rest) via AES-256.",
      "Kami mengikuti prinsip hak istimewa paling rendah (least privilege) secara internal dan mengaudit akses secara berkala.",
    ],
  },
  {
    id: "third-parties",
    title: "6. Layanan pihak ketiga",
    body: [
      "Kami menggunakan mitra infrastruktur tepercaya (cloud hosting, pengiriman email, analitik). Semua mitra terikat oleh perjanjian pemrosesan data.",
      "Daftar lengkap subprosesor tersedia atas permintaan.",
    ],
  },
  {
    id: "advertising",
    title: "7. Iklan",
    body: [
      "Beberapa halaman dari situs web publik kami mungkin menampilkan iklan bergambar. Jaringan iklan dapat menetapkan cookie mereka sendiri, yang diatur oleh kebijakan privasi mereka.",
      "Halaman dasbor yang terautentikasi tidak pernah menampilkan iklan pihak ketiga.",
    ],
  },
  {
    id: "user-rights",
    title: "8. Hak Anda",
    body: [
      "Anda dapat mengakses, mengekspor, atau menghapus data Anda kapan saja dari pengaturan dasbor Anda.",
      "Untuk permintaan GDPR atau CCPA, hubungi privacy@ftthtools.my.id.",
    ],
  },
]

export default async function PrivacyPage({ params }: PageProps) {
  const { locale } = await params
  const isId = locale === "id"
  const sections = isId ? sectionsId : sectionsEn

  return (
    <>
      <SiteNavbar locale={locale} />
      <main className="relative">
        <PageHeader
          eyebrow={isId ? "Hukum" : "Legal"}
          title={isId ? "Kebijakan Privasi" : "Privacy Policy"}
          description={isId ? "Terakhir diperbarui: 1 Mei 2026" : "Last updated: May 1, 2026"}
        />
        <LegalContent sections={sections} />
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
