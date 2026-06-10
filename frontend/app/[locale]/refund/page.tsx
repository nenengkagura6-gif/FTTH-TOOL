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
    id: "eligibility",
    title: "1. Refund eligibility",
    body: [
      "Refund requests are accepted within 7 days of your initial subscription purchase.",
      "To be eligible, you must not have exceeded the processing limits of the free starter tier (e.g. processed more than 5 files or 50,000 HP points in total) during your subscription period.",
    ],
  },
  {
    id: "non-refundable",
    title: "2. Non-refundable scenarios",
    body: [
      "No refunds are issued for renewals, custom enterprise development, API credits, or accounts suspended due to Terms of Service violations.",
      "Partial refunds for unused portions of a monthly billing cycle are not supported.",
    ],
  },
  {
    id: "process",
    title: "3. How to request a refund",
    body: [
      "To request a refund, contact our billing team at billing@ftthtools.my.id with your account email and transaction ID.",
      "Approved refunds are credited back to the original payment method within 5 to 10 business days.",
    ],
  },
]

const sectionsId: LegalSection[] = [
  {
    id: "eligibility",
    title: "1. Kelayakan pengembalian dana",
    body: [
      "Permintaan pengembalian dana diterima dalam waktu 7 hari sejak pembelian langganan awal Anda.",
      "Untuk memenuhi syarat, Anda tidak boleh melampaui batas pemrosesan tingkat Starter gratis (misalnya memproses lebih dari 5 file atau total 50.000 titik HP) selama masa langganan Anda.",
    ],
  },
  {
    id: "non-refundable",
    title: "2. Skenario non-refundable",
    body: [
      "Pengembalian dana tidak diberikan untuk perpanjangan otomatis, pengembangan enterprise kustom, kredit API, atau akun yang ditangguhkan karena pelanggaran Syarat Layanan.",
      "Pengembalian dana sebagian untuk porsi siklus penagihan bulanan yang tidak terpakai tidak didukung.",
    ],
  },
  {
    id: "process",
    title: "3. Cara mengajukan pengembalian dana",
    body: [
      "Untuk meminta pengembalian dana, hubungi tim tagihan kami di billing@ftthtools.my.id dengan menyertakan email akun dan ID transaksi Anda.",
      "Pengembalian dana yang disetujui akan dikreditkan kembali ke metode pembayaran asli dalam waktu 5 hingga 10 hari kerja.",
    ],
  },
]

export default async function RefundPage({ params }: PageProps) {
  const { locale } = await params
  const isId = locale === "id"
  const sections = isId ? sectionsId : sectionsEn

  return (
    <>
      <SiteNavbar locale={locale} />
      <main className="relative">
        <PageHeader
          eyebrow={isId ? "Hukum" : "Legal"}
          title={isId ? "Kebijakan Pengembalian Dana" : "Refund Policy"}
          description={isId ? "Terakhir diperbarui: 1 Mei 2026" : "Last updated: May 1, 2026"}
        />
        <LegalContent sections={sections} />
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
