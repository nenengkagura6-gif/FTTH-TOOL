import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { FtthRouteMap } from "@/components/landing/ftth-route-map"
import { translations } from "@/lib/translations"

/**
 * Hero.
 *
 * Prinsipnya: satu elemen berani, sisanya diam. Yang berani di sini adalah
 * peta rute FTTH di sebelah kanan — ia menjelaskan produknya tanpa satu
 * kata pun. Kolom kiri sengaja dijaga tenang: tidak ada gradien teks, tidak
 * ada glow di balik tombol, tidak ada animasi masuk. Halaman terasa generik
 * justru ketika setiap bagian berebut perhatian.
 *
 * Angka dan nama format di bawah headline nyata dan bisa diverifikasi —
 * 20 tool sesuai daftar di lib/site-config.ts. Klaim konkret adalah pembeda
 * paling murah antara halaman yang ditulis orang dan yang ditulis mesin.
 */
export function Hero({ locale = "en" }: { locale?: string }) {
  const t = translations[locale as "en" | "id"] || translations.en
  const isId = locale === "id"

  return (
    <section className="relative isolate overflow-hidden border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-24 pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8 lg:pt-28 lg:pb-20">
        {/* ---------- Kolom kiri: teks, tenang ---------- */}
        <div>
          {/* Penanda kategori, bukan badge "✨ Powered by AI" */}
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">
            {isId ? "Otomatisasi Perencanaan FTTH" : "FTTH Planning Automation"}
          </p>

          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.06] tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {isId ? (
              <>
                Platform Otomatisasi{" "}
                <span className="text-primary">FTTH Tool</span> Modern
              </>
            ) : (
              <>
                Modern <span className="text-primary">FTTH Tool</span>{" "}
                Automation Platform
              </>
            )}
          </h1>

          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground text-pretty">
            {t.hero.subtitle}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t.hero.btnStart}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#tools"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              {t.hero.btnExplore}
            </Link>
          </div>

          {/* Format nyata yang ditangani — kosakata domain, bukan logo palsu */}
          <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-6">
            {[
              { k: isId ? "Masukan" : "Input", v: "KML · KMZ · DXF · SHP · SOR" },
              { k: isId ? "Keluaran" : "Output", v: "XLSX · CSV · KML · DXF" },
            ].map((item) => (
              <div key={item.k}>
                <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground/70">
                  {item.k}
                </dt>
                <dd className="mt-1 font-mono text-xs text-foreground/80">{item.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ---------- Kolom kanan: elemen signature ---------- */}
        <div className="relative">
          <FtthRouteMap className="h-auto w-full" />
        </div>
      </div>
    </section>
  )
}
