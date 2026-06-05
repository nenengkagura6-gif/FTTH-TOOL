import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { siteConfig } from "@/lib/site-config"
import { Target, Lightbulb, Users, Cable } from "lucide-react"

interface PageProps {
  params: Promise<{
    locale: string
  }>
}

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params

  const stats = [
    { value: "2.4M+", label: locale === "en" ? "HP points processed" : "Titik HP diproses" },
    { value: "120+", label: locale === "en" ? "Engineering teams" : "Tim rekayasa aktif" },
    { value: "18", label: locale === "en" ? "Countries served" : "Negara terlayani" },
    { value: "99.9%", label: locale === "en" ? "Platform uptime" : "Waktu aktif sistem" },
  ]

  const timeline = [
    {
      year: "2023",
      title: locale === "en" ? "The seed of an idea" : "Benih ide pertama",
      description: locale === "en"
        ? "Frustrated by manual KML processing, our founders prototyped the first BOQ generator."
        : "Frustrasi oleh pemrosesan KML manual, pendiri kami merancang prototipe pembuat BOQ pertama.",
    },
    {
      year: "2024",
      title: locale === "en" ? "First production rollout" : "Peluncuran produksi pertama",
      description: locale === "en"
        ? "FTTH Tool processes its first 100,000 HP points across three regional ISPs."
        : "FTTH Tool memproses 100.000 titik HP pertamanya di tiga ISP regional.",
    },
    {
      year: "2025",
      title: locale === "en" ? "Platform expansion" : "Ekspansi platform",
      description: locale === "en"
        ? "Database HP and Duplicate Checker tools launch. Team grows to 12 engineers."
        : "Fitur Database HP dan Duplicate Checker resmi dirilis. Tim berkembang menjadi 12 insinyur.",
    },
    {
      year: "2026",
      title: locale === "en" ? "Today" : "Hari Ini",
      description: locale === "en"
        ? "Trusted by 120+ engineering teams across 18 countries. Just getting started."
        : "Dipercaya oleh 120+ tim rekayasa di 18 negara. Kami baru saja memulai.",
    },
  ]

  const values = [
    {
      icon: Target,
      title: locale === "en" ? "Mission" : "Misi Kami",
      description: locale === "en"
        ? "Eliminate the manual toil from FTTH engineering so teams focus on building networks."
        : "Menghilangkan pekerjaan manual dari teknik FTTH sehingga tim dapat fokus membangun jaringan.",
    },
    {
      icon: Lightbulb,
      title: locale === "en" ? "Platform" : "Fokus Fitur",
      description: locale === "en"
        ? "A focused suite of KML and document automation tools — no bloat, no fluff."
        : "Rangkaian alat otomatisasi dokumen dan KML yang terfokus — tanpa fitur berlebih yang tidak perlu.",
    },
    {
      icon: Cable,
      title: locale === "en" ? "Telecom focus" : "Fokus Telekomunikasi",
      description: locale === "en"
        ? "Built by fiber engineers for fiber engineers. Every workflow is shaped by the field."
        : "Dibuat oleh insinyur fiber optik untuk insinyur fiber optik. Setiap alur kerja disesuaikan dengan lapangan.",
    },
    {
      icon: Users,
      title: locale === "en" ? `Why ${siteConfig.org}` : `Mengapa ${siteConfig.org}`,
      description: locale === "en"
        ? "We've been in the trenches deploying FTTH networks. We knew the pain and we built the cure."
        : "Kami telah berpengalaman langsung menggelar jaringan FTTH. Kami tahu kendalanya dan kami membangun solusinya.",
    },
  ]

  return (
    <>
      <SiteNavbar locale={locale} />
      <main className="relative">
        <PageHeader
          eyebrow={locale === "en" ? "About" : "Tentang Kami"}
          title={locale === "en" ? "Built by fiber engineers, for fiber engineers" : "Dibuat oleh insinyur fiber optik, untuk insinyur fiber optik"}
          description={locale === "en"
            ? `${siteConfig.org} is on a mission to make FTTH engineering workflows feel modern.`
            : `${siteConfig.org} memiliki misi untuk membuat alur kerja rekayasa teknik FTTH terasa modern.`}
        />

        {/* Mission grid */}
        <section className="relative mx-auto max-w-6xl px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {values.map((v) => (
              <div
                key={v.title}
                className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <v.icon className="h-4 w-4" />
                </div>
                <h2 className="mt-4 text-base font-medium">{v.title}</h2>
                <p
                  className="mt-2 text-sm leading-relaxed text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: v.description }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="relative mx-auto max-w-6xl px-6 py-12">
          <div className="rounded-3xl border border-white/10 bg-card/40 p-8 sm:p-12 backdrop-blur-sm">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              {stats.map((s) => (
                <div key={s.label} className="text-center sm:text-left">
                  <p className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section className="relative mx-auto max-w-4xl px-6 py-16">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-primary">
              {locale === "en" ? "Our story" : "Kisah Kami"}
            </p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
              {locale === "en" ? "From frustration to platform" : "Dari keresahan menjadi platform utama"}
            </h2>
          </div>

          <ol className="relative space-y-8">
            <span
              aria-hidden="true"
              className="absolute left-[14px] top-2 bottom-2 w-px bg-white/10"
            />
            {timeline.map((t) => (
              <li key={t.year} className="relative pl-12">
                <span className="absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-background">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                </span>
                <p className="text-xs font-mono text-muted-foreground">
                  {t.year}
                </p>
                <h3 className="mt-1 text-base font-medium">{t.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {t.description}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Contact */}
        <section
          id="contact"
          className="relative mx-auto max-w-4xl px-6 py-16 scroll-mt-24"
        >
          <div className="rounded-3xl border border-white/10 bg-card/40 p-8 sm:p-12 backdrop-blur-sm text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {locale === "en" ? "Want to talk to the team?" : "Ingin berbicara dengan tim kami?"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {locale === "en" ? "We love hearing from FTTH engineering teams. Drop us a line." : "Kami senang mendengar dari tim rekayasa FTTH. Silakan hubungi kami."}
            </p>
            <a
              href="mailto:hello@nusahytoria.com"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              hello@nusahytoria.com
            </a>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
