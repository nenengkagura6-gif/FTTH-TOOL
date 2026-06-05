import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Clock, Calendar, ArrowRight, Sparkles, HelpCircle } from "lucide-react"
import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { getPostBySlug, getAllPosts } from "@/lib/blog"
import { cn } from "@/lib/utils"
import { translations } from "@/lib/translations"

interface PageProps {
  params: Promise<{
    locale: string
    slug: string
  }>
}

export async function generateStaticParams() {
  const locales = ["en", "id"]
  const params: { locale: string; slug: string }[] = []

  for (const locale of locales) {
    const posts = getAllPosts(locale)
    for (const post of posts) {
      params.push({
        locale,
        slug: post.slug,
      })
    }
  }

  return params
}

export async function generateMetadata({ params }: PageProps) {
  const { locale, slug } = await params
  const post = await getPostBySlug(slug, locale)
  if (!post) {
    return {
      title: "Post Not Found",
    }
  }
  return {
    title: `${post.title} | FTTH Engineer Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
    },
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale, slug } = await params
  const post = await getPostBySlug(slug, locale)

  if (!post) {
    notFound()
  }

  // Get related/recent posts (excluding current post)
  const allPosts = getAllPosts(locale)
  const relatedPosts = allPosts
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2)

  const t = translations[locale as "en" | "id"] || translations.en

  // Determine context-based CTA
  const ctaKey = (post.cta || "").toLowerCase()

  // Default CTA configurations (English / Indonesian)
  let ctaTitle = locale === "en" ? "Automate Your KMLs" : "Otomatiskan KML Anda"
  let ctaDesc = locale === "en"
    ? "Stop counting cables and poles manually. Upload your KML/KMZ design and generate a complete BOQ Excel sheet instantly."
    : "Berhenti menghitung kabel dan tiang secara manual. Unggah desain KML/KMZ Anda dan hasilkan sheet Excel BOQ lengkap secara instan."
  let ctaLinks = locale === "en" ? [
    { label: "KML to BOQ Tool", href: "/dashboard/kml-boq", primary: true },
    { label: "KML Duplicate Checker", href: "/dashboard/kml-checker", primary: false }
  ] : [
    { label: "Alat KML ke BOQ", href: "/dashboard/kml-boq", primary: true },
    { label: "Pendeteksi Duplikat KML", href: "/dashboard/kml-checker", primary: false }
  ]

  if (ctaKey === "otdr-analyzer") {
    ctaTitle = locale === "en" ? "OTDR Trace Analyzer" : "Penganalisis Trace OTDR"
    ctaDesc = locale === "en"
      ? "Analyze SOR traces and generate professional fiber trace reports directly in your browser. Complete with visual graph events."
      : "Urai berkas SOR lapangan Anda, tampilkan event grafis secara visual, dan cetak laporan penerimaan PDF profesional langsung dari peramban."
    ctaLinks = locale === "en" ? [
      { label: "OTDR Trace Tool", href: "/dashboard/otdr-analyzer", primary: true }
    ] : [
      { label: "Alat Trace OTDR", href: "/dashboard/otdr-analyzer", primary: true }
    ]
  } else if (ctaKey === "splice-manager") {
    ctaTitle = locale === "en" ? "Splice Joint Manager" : "Kelola Penyambungan (Splice)"
    ctaDesc = locale === "en"
      ? "Calculate and visualize fiber distribution core splicing from FDT/ODC to FAT/ODP. Clean and exportable tables."
      : "Hitung dan visualisasikan penyambungan inti serat dari FDC/ODC ke FAT/ODP. Ekspor tabel penyambungan rapi."
    ctaLinks = locale === "en" ? [
      { label: "Splice Manager Tool", href: "/dashboard/splice-manager", primary: true },
      { label: "Fiber Color Code Finder", href: "/dashboard/fiber-color-code", primary: false }
    ] : [
      { label: "Alat Splice Manager", href: "/dashboard/splice-manager", primary: true },
      { label: "Pencari Warna Fiber", href: "/dashboard/fiber-color-code", primary: false }
    ]
  } else if (ctaKey === "opm-calculator") {
    ctaTitle = locale === "en" ? "OPM Link Loss Budget" : "Anggaran Redaman OPM"
    ctaDesc = locale === "en"
      ? "Calculate total fiber path loss and optical power link budget using standard telecommunication formulas."
      : "Hitung total kerugian jalur serat optik dan anggaran daya tautan menggunakan rumus standar telekomunikasi secara instan."
    ctaLinks = locale === "en" ? [
      { label: "OPM Link Budget Tool", href: "/dashboard/opm-calculator", primary: true }
    ] : [
      { label: "Alat Anggaran OPM", href: "/dashboard/opm-calculator", primary: true }
    ]
  } else if (ctaKey === "kml-checker") {
    ctaTitle = locale === "en" ? "Clean KML Duplicates" : "Bersihkan Duplikat KML"
    ctaDesc = locale === "en"
      ? "Find and clean duplicate pole and homepass points across your files before sending them to deployment."
      : "Temukan dan hapus titik tiang dan homepass ganda secara instan. Pastikan data perencanaan KML Anda 100% bersih."
    ctaLinks = locale === "en" ? [
      { label: "Duplicate Checker", href: "/dashboard/kml-checker", primary: true },
      { label: "KML to BOQ Tool", href: "/dashboard/kml-boq", primary: false }
    ] : [
      { label: "Alat Pendeteksi Duplikat", href: "/dashboard/kml-checker", primary: true },
      { label: "Alat KML ke BOQ", href: "/dashboard/kml-boq", primary: false }
    ]
  } else if (ctaKey === "design-suite") {
    ctaTitle = locale === "en" ? "FTTH Design Suite" : "Paket Desain FTTH"
    ctaDesc = locale === "en"
      ? "Generate instant spreadsheets for materials using our BOQ engine and calculate optical path link loss budgets together."
      : "Dapatkan estimasi material instan dengan alat BOQ kami serta hitung anggaran redaman tautan dalam satu alur kerja cepat."
    ctaLinks = locale === "en" ? [
      { label: "KML to BOQ Tool", href: "/dashboard/kml-boq", primary: true },
      { label: "OPM Link Budget Tool", href: "/dashboard/opm-calculator", primary: false }
    ] : [
      { label: "Alat KML ke BOQ", href: "/dashboard/kml-boq", primary: true },
      { label: "Kalkulator Redaman OPM", href: "/dashboard/opm-calculator", primary: false }
    ]
  }

  return (
    <>
      <SiteNavbar locale={locale} />
      <main className="relative min-h-screen pt-24 pb-20 overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] pointer-events-none select-none overflow-hidden -z-10 opacity-30">
          <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-[-10%] right-[10%] w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-3xl" />
        </div>

        <div className="mx-auto max-w-5xl px-6">
          {/* Back button */}
          <Link
            href={`/${locale}/blog`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors group cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            {t.blog.backToArticles}
          </Link>

          {/* Article Header */}
          <div className="mb-10">
            {post.image && (
              <div className="relative w-full aspect-video rounded-2xl border border-white/10 overflow-hidden mb-8 shadow-2xl">
                <img
                  src={post.image}
                  alt={post.title}
                  className="object-cover w-full h-full"
                />
              </div>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 Hook ring-1 ring-primary/20 mb-4">
              {post.category}
            </span>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-balance leading-[1.15] mb-6">
              {post.title}
            </h1>
            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground border-y border-white/10 py-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{post.date}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{post.readTime} {t.blog.readTimeSuffix}</span>
              </div>
            </div>
          </div>

          {/* Article Layout Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12 items-start">
            {/* Main Content Area */}
            <article 
              className="blog-prose w-full animate-in fade-in duration-300"
              dangerouslySetInnerHTML={{ __html: post.contentHtml || "" }}
            />

            {/* Sidebar with CTAs */}
            <aside className="space-y-6 lg:sticky lg:top-28">
              {/* Tool CTA Card */}
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card/60 p-6 backdrop-blur-sm">
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
                
                <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 mb-4">
                  <Sparkles className="h-5 w-5" />
                </div>
                
                <h3 className="text-base font-semibold mb-2">{ctaTitle}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  {ctaDesc}
                </p>

                <div className="space-y-2">
                  {ctaLinks.map((link, idx) => (
                    <Link
                      key={idx}
                      href={link.href}
                      className={cn(
                        "flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all group cursor-pointer",
                        link.primary
                          ? "bg-primary text-primary-foreground hover:bg-primary/95 shadow-lg shadow-primary/15"
                          : "border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-foreground"
                      )}
                    >
                      {link.label}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  ))}
                </div>
              </div>

              {/* Need help Card */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.01] p-6 text-center">
                <HelpCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <h4 className="text-sm font-medium mb-1">{t.blog.feedbackTitle}</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  {t.blog.feedbackDesc}
                </p>
                <Link
                  href={`/${locale}/about`}
                  className="inline-flex text-xs text-primary hover:underline"
                >
                  {t.blog.contactSupport}
                </Link>
              </div>
            </aside>
          </div>

          {/* Related Articles Footer */}
          {relatedPosts.length > 0 && (
            <div className="mt-20 pt-10 border-t border-white/10">
              <h2 className="text-xl font-semibold mb-8">{t.blog.relatedArticles}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {relatedPosts.map((relatedPost) => (
                  <Link
                    key={relatedPost.slug}
                    href={`/${locale}/blog/${relatedPost.slug}`}
                    className="group block rounded-2xl border border-white/10 bg-card/30 p-5 hover:border-white/20 transition-all hover:bg-card/50"
                  >
                    <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                      {relatedPost.category}
                    </span>
                    <h3 className="text-base font-semibold group-hover:text-primary transition-colors mt-2 mb-2 line-clamp-1">
                      {relatedPost.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                      {relatedPost.excerpt}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground group-hover:underline">
                      {t.blog.readMore} <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
