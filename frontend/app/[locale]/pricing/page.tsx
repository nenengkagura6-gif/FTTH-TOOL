import Link from "next/link"
import { Check, Minus } from "lucide-react"
import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { cn } from "@/lib/utils"
import { translations } from "@/lib/translations"

interface PageProps {
  params: Promise<{
    locale: string
  }>
}

export default async function PricingPage({ params }: PageProps) {
  const { locale } = await params
  const t = translations[locale as "en" | "id"] || translations.en

  const plans = [
    {
      name: locale === "en" ? "Free" : "Gratis",
      price: "$0",
      cadence: locale === "en" ? "/forever" : "/selamanya",
      description: locale === "en" ? "Perfect for individual engineers and small projects." : "Sangat cocok untuk insinyur individu dan proyek kecil.",
      features: [
        { label: locale === "en" ? "Up to 5 files / month" : "Hingga 5 file / bulan", included: true },
        { label: locale === "en" ? "Max 10,000 HP per file" : "Maks 10.000 HP per file", included: true },
        { label: locale === "en" ? "Standard processing queue" : "Antrean pemrosesan standar", included: true },
        { label: locale === "en" ? "Community support" : "Dukungan komunitas", included: true },
        { label: locale === "en" ? "Premium tools" : "Alat premium", included: false },
        { label: locale === "en" ? "Priority queue" : "Antrean prioritas", included: false },
        { label: locale === "en" ? "API access" : "Akses API", included: false },
      ],
      cta: { label: locale === "en" ? "Start Free" : "Mulai Gratis", href: "/signup" },
      highlight: false,
    },
    {
      name: "Pro",
      price: "$20",
      cadence: locale === "en" ? "/month" : "/bulan",
      description: locale === "en" ? "For professional fiber engineers and growing teams." : "Untuk insinyur fiber profesional dan tim yang berkembang.",
      features: [
        { label: locale === "en" ? "Unlimited files" : "File tak terbatas", included: true },
        { label: locale === "en" ? "Up to 200,000 HP per file" : "Hingga 200.000 HP per file", included: true },
        { label: locale === "en" ? "Priority processing queue" : "Antrean pemrosesan prioritas", included: true },
        { label: locale === "en" ? "Email support · 24h SLA" : "Dukungan email · SLA 24 jam", included: true },
        { label: locale === "en" ? "All premium tools" : "Semua alat premium", included: true },
        { label: locale === "en" ? "Faster processing engine" : "Mesin pemrosesan lebih cepat", included: true },
        { label: locale === "en" ? "API access" : "Akses API", included: true },
      ],
      cta: { label: locale === "en" ? "Upgrade to Pro" : "Tingkatkan ke Pro", href: "/signup" },
      highlight: true,
    },
  ]

  const compare = [
    { label: locale === "en" ? "Files per month" : "File per bulan", free: "5", pro: locale === "en" ? "Unlimited" : "Tanpa Batas" },
    { label: locale === "en" ? "HP per file" : "HP per file", free: "10,000", pro: "200,000" },
    { label: locale === "en" ? "Queue priority" : "Prioritas antrean", free: locale === "en" ? "Standard" : "Standar", pro: locale === "en" ? "Priority" : "Prioritas" },
    { label: locale === "en" ? "Premium tools" : "Alat premium", free: false, pro: true },
    { label: locale === "en" ? "API access" : "Akses API", free: false, pro: true },
    { label: locale === "en" ? "Support" : "Dukungan", free: locale === "en" ? "Community" : "Komunitas", pro: locale === "en" ? "Email · 24h SLA" : "Email · SLA 24j" },
  ]

  const faqs = [
    {
      q: locale === "en" ? "Can I switch plans anytime?" : "Apakah saya bisa mengubah paket kapan saja?",
      a: locale === "en" 
        ? "Yes. You can upgrade or downgrade at any time. Changes prorate automatically."
        : "Ya. Anda dapat melakukan upgrade atau downgrade kapan saja. Perubahan biaya akan disesuaikan secara otomatis.",
    },
    {
      q: locale === "en" ? "Do you offer team pricing?" : "Apakah Anda menawarkan harga khusus tim?",
      a: locale === "en"
        ? "Yes — contact us for team and enterprise pricing tailored to your headcount."
        : "Ya — silakan hubungi kami untuk mendapatkan penawaran khusus tim dan enterprise yang disesuaikan dengan jumlah anggota tim Anda.",
    },
    {
      q: locale === "en" ? "Is my data safe?" : "Apakah data saya aman?",
      a: locale === "en"
        ? "Files are processed in isolated workers and removed after delivery. We never train on your data."
        : "File Anda diproses di worker yang terisolasi dan dihapus setelah pengiriman. Kami tidak pernah menggunakan data Anda untuk melatih model kami.",
    },
    {
      q: locale === "en" ? "Do you support API access?" : "Apakah Anda mendukung akses API?",
      a: locale === "en"
        ? "Yes, on the Pro plan. See our documentation for endpoints and rate limits."
        : "Ya, tersedia pada paket Pro. Silakan lihat dokumentasi kami untuk endpoint dan batas penggunaan.",
    },
  ]

  return (
    <>
      <SiteNavbar locale={locale} />
      <main className="relative">
        <PageHeader
          eyebrow={t.nav.pricing}
          title={t.pricing.title}
          description={t.pricing.subtitle}
        />

        <section className="relative mx-auto max-w-5xl px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative flex flex-col rounded-3xl border p-8 backdrop-blur-sm transition-all group",
                  plan.highlight
                    ? "border-primary/40 bg-card/60 tech-border-glow"
                    : "border-white/10 bg-card/40 hover:border-white/20 hover:bg-card/60 hover:tech-border-glow",
                )}
              >
                {/* Hardware blueprint corner brackets */}
                <div className="tech-bracket-tl opacity-30 group-hover:opacity-100 transition-opacity" />
                <div className="tech-bracket-tr opacity-30 group-hover:opacity-100 transition-opacity" />
                <div className="tech-bracket-bl opacity-30 group-hover:opacity-100 transition-opacity" />
                <div className="tech-bracket-br opacity-30 group-hover:opacity-100 transition-opacity" />

                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-primary-foreground">
                    {locale === "en" ? "Most popular" : "Paling populer"}
                  </span>
                )}
                <div>
                  <h2 className="text-base font-medium font-display">{plan.name}</h2>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight font-display">
                      {plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {plan.cadence}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                </div>

                <ul className="mt-8 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li
                      key={f.label}
                      className="flex items-start gap-3 text-sm"
                    >
                      {f.included ? (
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      ) : (
                        <Minus className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                      )}
                      <span
                        className={cn(
                          f.included
                            ? "text-foreground"
                            : "text-muted-foreground/60",
                        )}
                      >
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.cta.href}
                  className={cn(
                    "mt-8 inline-flex items-center justify-center rounded-full py-2.5 text-sm font-medium transition-colors",
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-white/10 bg-white/[0.03] text-foreground hover:border-white/30",
                  )}
                >
                  {plan.cta.label}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison */}
        <section className="relative mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center font-display">
            {locale === "en" ? "Compare plans" : "Perbandingan paket"}
          </h2>

          <div className="mt-10 rounded-3xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
            <div className="grid grid-cols-[1.5fr_1fr_1fr] divide-x divide-white/10">
              <div className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {locale === "en" ? "Feature" : "Fitur"}
              </div>
              <div className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium text-center">
                {locale === "en" ? "Free" : "Gratis"}
              </div>
              <div className="p-4 text-xs uppercase tracking-wider text-primary font-medium text-center">
                Pro
              </div>
            </div>
            <ul className="divide-y divide-white/10">
              {compare.map((row) => (
                <li
                  key={row.label}
                  className="grid grid-cols-[1.5fr_1fr_1fr] divide-x divide-white/10"
                >
                  <span className="p-4 text-sm">{row.label}</span>
                  <span className="p-4 text-sm text-center text-muted-foreground">
                    {typeof row.free === "boolean" ? (
                      row.free ? (
                        <Check className="inline h-4 w-4 text-primary" />
                      ) : (
                        <Minus className="inline h-4 w-4 text-muted-foreground/40" />
                      )
                    ) : (
                      row.free
                    )}
                  </span>
                  <span className="p-4 text-sm text-center text-foreground">
                    {typeof row.pro === "boolean" ? (
                      row.pro ? (
                        <Check className="inline h-4 w-4 text-primary" />
                      ) : (
                        <Minus className="inline h-4 w-4 text-muted-foreground/40" />
                      )
                    ) : (
                      row.pro
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section className="relative mx-auto max-w-3xl px-6 pb-24">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center font-display">
            {locale === "en" ? "Frequently asked questions" : "Pertanyaan yang sering diajukan"}
          </h2>
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm"
              >
                <summary className="flex items-center justify-between cursor-pointer text-sm font-medium">
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
