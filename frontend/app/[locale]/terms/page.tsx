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
    id: "usage",
    title: "1. Usage policy",
    body: [
      "By accessing FTTH Tool, you agree to use the platform for lawful purposes only and in accordance with these terms.",
      "You are responsible for maintaining the confidentiality of your account credentials.",
    ],
  },
  {
    id: "files",
    title: "2. File restrictions",
    body: [
      "Uploaded files must not contain malware, illegal content, or personal data that you do not have rights to process.",
      "We reserve the right to remove files that violate this policy and suspend accounts repeatedly in violation.",
    ],
  },
  {
    id: "fair-use",
    title: "3. Fair use",
    body: [
      "Free plan limits exist to ensure quality of service for all users. Excessive automated requests may be rate-limited.",
      "Pro plans include generous limits and priority queue access.",
    ],
  },
  {
    id: "liability",
    title: "4. Liability limitations",
    body: [
      "FTTH Tool is provided on an as-is basis. We make no warranties about the accuracy of automated outputs and recommend manual review for critical deliverables.",
      "To the fullest extent permitted by law, our liability for any claim is limited to the fees paid in the prior 12 months.",
    ],
  },
  {
    id: "suspension",
    title: "5. Account suspension",
    body: [
      "We may suspend or terminate accounts that violate these terms, attempt to compromise platform security, or engage in abusive behavior.",
      "Suspended users may export their data within 30 days of notice.",
    ],
  },
  {
    id: "ip",
    title: "6. Intellectual property",
    body: [
      "You retain all rights to the files and outputs you produce on the platform.",
      "FTTH Tool, including the platform, brand, and software, remains the intellectual property of Nusa Hytoria.",
    ],
  },
  {
    id: "changes",
    title: "7. Changes to these terms",
    body: [
      "We may update these terms periodically. Material changes will be communicated via email or in-product notice at least 30 days before taking effect.",
    ],
  },
]

const sectionsId: LegalSection[] = [
  {
    id: "usage",
    title: "1. Kebijakan penggunaan",
    body: [
      "Dengan mengakses FTTH Tool, Anda setuju untuk menggunakan platform ini hanya untuk tujuan yang sah dan sesuai dengan syarat-syarat ini.",
      "Anda bertanggung jawab untuk menjaga kerahasiaan kredensial akun Anda.",
    ],
  },
  {
    id: "files",
    title: "2. Batasan file",
    body: [
      "File yang diunggah tidak boleh mengandung malware, konten ilegal, atau data pribadi yang Anda tidak memiliki hak untuk memprosesnya.",
      "Kami berhak menghapus file yang melanggar kebijakan ini dan menangguhkan akun yang berulang kali melanggar.",
    ],
  },
  {
    id: "fair-use",
    title: "3. Penggunaan wajar",
    body: [
      "Batas paket gratis ada untuk memastikan kualitas layanan bagi semua pengguna. Permintaan otomatis yang berlebihan dapat dikenakan pembatasan tarif (rate-limiting).",
      "Paket Pro mencakup batas yang murah hati dan akses prioritas antrean.",
    ],
  },
  {
    id: "liability",
    title: "4. Batasan tanggung jawab",
    body: [
      "FTTH Tool disediakan apa adanya. Kami tidak memberikan jaminan tentang keakuratan hasil otomatis dan merekomendasikan peninjauan manual untuk hasil akhir yang penting.",
      "Sejauh yang diizinkan oleh hukum, tanggung jawab kami untuk klaim apa pun terbatas pada biaya yang dibayarkan dalam 12 bulan sebelumnya.",
    ],
  },
  {
    id: "suspension",
    title: "5. Penangguhan akun",
    body: [
      "Kami dapat menangguhkan atau menghentikan akun yang melanggar syarat-syarat ini, mencoba mengompromikan keamanan platform, atau terlibat dalam perilaku kasar.",
      "Pengguna yang ditangguhkan dapat mengekspor data mereka dalam waktu 30 hari sejak pemberitahuan.",
    ],
  },
  {
    id: "ip",
    title: "6. Kekayaan intelektual",
    body: [
      "Anda mempertahankan semua hak atas file dan hasil yang Anda hasilkan di platform.",
      "FTTH Tool, termasuk platform, merek, dan perangkat lunak, tetap merupakan kekayaan intelektual dari Nusa Hytoria.",
    ],
  },
  {
    id: "changes",
    title: "7. Perubahan syarat ketentuan",
    body: [
      "Kami dapat memperbarui syarat-syarat ini secara berkala. Perubahan material akan dikomunikasikan melalui email atau pemberitahuan di dalam produk setidaknya 30 hari sebelum berlaku.",
    ],
  },
]

export default async function TermsPage({ params }: PageProps) {
  const { locale } = await params
  const isId = locale === "id"
  const sections = isId ? sectionsId : sectionsEn

  return (
    <>
      <SiteNavbar locale={locale} />
      <main className="relative">
        <PageHeader
          eyebrow={isId ? "Hukum" : "Legal"}
          title={isId ? "Syarat dan Ketentuan Layanan" : "Terms of Service"}
          description={isId ? "Terakhir diperbarui: 1 Mei 2026" : "Last updated: May 1, 2026"}
        />
        <LegalContent sections={sections} />
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
