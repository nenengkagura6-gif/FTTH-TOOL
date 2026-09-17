import Link from "next/link"
import { Mail } from "lucide-react"
import { siteConfig } from "@/lib/site-config"
import { translations } from "@/lib/translations"

export function SiteFooter({ locale = "en" }: { locale?: string }) {
  const t = translations[locale as "en" | "id"] || translations.en

  const localizedProductLinks = [
    { label: t.nav.tools, href: `/${locale}#tools` },
    { label: t.nav.pricing, href: `/${locale}/pricing` },
    { label: t.nav.docs, href: `/${locale}/docs` },
    { label: t.nav.blog, href: `/${locale}/blog` },
  ]

  const localizedCompanyLinks = [
    { label: t.nav.about, href: `/${locale}/about` },
    { label: "Contact", href: `/${locale}/contact` },
  ]

  const localizedLegalLinks = [
    { label: locale === "en" ? "Privacy Policy" : "Kebijakan Privasi", href: `/${locale}/privacy` },
    { label: locale === "en" ? "Terms of Service" : "Syarat & Ketentuan", href: `/${locale}/terms` },
    { label: locale === "en" ? "Refund Policy" : "Kebijakan Refund", href: `/${locale}/refund` },
  ]

  return (
    <footer className="relative border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative w-7 h-7 flex items-center justify-center">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10" />
                <div className="relative w-5 h-5">
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary top-0 left-1/2 -translate-x-1/2" />
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary/80 left-0 top-1/2 -translate-y-1/2" />
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary/80 right-0 top-1/2 -translate-y-1/2" />
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary bottom-0 left-1/2 -translate-x-1/2" />
                </div>
              </div>
              <span className="font-semibold tracking-tight">
                {siteConfig.name}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {locale === "en"
                ? siteConfig.description
                : "Platform otomatisasi teknik FTTH dan telekomunikasi modern. Otomatiskan KML, database, dan dokumen dalam hitungan detik."}
            </p>
            {/* Tiga ikon media sosial sebelumnya semuanya href="#" —
                tautan mati yang tidak menuju ke mana pun. Lebih baik satu
                kontak yang benar-benar bisa dihubungi daripada tiga ikon
                yang tidak berfungsi. Kalau nanti akunnya sudah ada,
                kembalikan ikonnya dengan URL yang sebenarnya. */}
            <div className="mt-5">
              <a
                href="/id/contact"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                <Mail className="h-4 w-4" />
                {locale === "en" ? "Contact us" : "Hubungi kami"}
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground mb-4">
              {locale === "en" ? "Product" : "Produk"}
            </h3>
            <ul className="space-y-3">
              {localizedProductLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground mb-4">
              {locale === "en" ? "Company" : "Perusahaan"}
            </h3>
            <ul className="space-y-3">
              {localizedCompanyLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground mb-4">Legal</h3>
            <ul className="space-y-3">
              {localizedLegalLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {siteConfig.org}. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            {locale === "en"
              ? "Built by fiber engineers, for fiber engineers."
              : "Dibuat oleh orang lapangan, untuk orang lapangan."}
          </p>
        </div>
      </div>
    </footer>
  )
}
