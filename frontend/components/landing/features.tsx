"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { useSectionPlay } from "@/components/landing/use-section-play"
import { ArrowUpRight } from "lucide-react"
import { CharIn } from "@/components/landing/char-in"
import { CurveBand } from "@/components/landing/curve-band"
import {
  MapIcon,
  DatabaseIcon,
  ShieldCheckIcon,
  ChartLineIcon,
  ScissorsIcon,
  ActivityIcon,
  PaletteIcon,
  DraftingCompassIcon,
} from "@/components/landing/tool-icons"
import { translations } from "@/lib/translations"

/** Format yang ditangani seluruh tool — isi pita berjalan. */
const TICKER_ITEMS = [
  "KML", "KMZ", "DXF", "SHP", "CSV", "XLSX", "SOR", "GeoJSON", "WGS-84", "UTM",
]

export function Features({ locale = "en" }: { locale?: string }) {
  const t = translations[locale as "en" | "id"] || translations.en
  const { ref: sectionRef, dataPlay } = useSectionPlay<HTMLElement>()

  const localizedFeatures = [
    {
      icon: MapIcon,
      title: "KML to BOQ",
      description:
        locale === "en"
          ? "Auto-generate Bill of Quantities (Excel) from KML files. Cable, splitter, and pole quantities computed in seconds."
          : "Hasilkan Bill of Quantities (Excel) secara otomatis dari file KML. Jumlah kabel, splitter, dan tiang dihitung dalam hitungan detik.",
      href: "/dashboard/kml-boq",
    },
    {
      icon: ShieldCheckIcon,
      title: "KML Duplicate Checker",
      description:
        locale === "en"
          ? "Detect duplicate homepass and pole points across KML files before they hit production."
          : "Deteksi titik homepass dan tiang ganda di seluruh file KML sebelum masuk tahap produksi.",
      href: "/dashboard/kml-checker",
    },
    {
      icon: ChartLineIcon,
      title: "OTDR Trace Analyzer",
      description:
        locale === "en"
          ? "Parse Telcordia SOR files, plot dynamic event graphs, and export professional PDF trace reports."
          : "Urai file Telcordia SOR, gambar grafik event dinamis, dan ekspor laporan trace format PDF profesional.",
      href: "/dashboard/otdr-analyzer",
    },
    {
      icon: ScissorsIcon,
      title: "Splice Manager",
      description:
        locale === "en"
          ? "Generate FDT to FAT core splicing tables automatically with standard color code mapping."
          : "Hasilkan tabel splicing core FDT ke FAT otomatis dengan pemetaan kode warna serat standar.",
      href: "/dashboard/splice-manager",
    },
    {
      icon: ActivityIcon,
      title: "OPM Link Budget",
      description:
        locale === "en"
          ? "Calculate optical path loss and verify link power margin safety ranges using standard formulas."
          : "Hitung redaman jalur optik dan verifikasi margin cadangan daya aman menggunakan rumus standar telekomunikasi.",
      href: "/dashboard/opm-calculator",
    },
    {
      icon: PaletteIcon,
      title: "Fiber Color Code",
      description:
        locale === "en"
          ? "Lookup TIA-598-C and Telkom standard core and tube color schemes for any fiber count."
          : "Cari skema warna core dan tube standar TIA-598-C dan Telkom untuk nomor serat berapa pun.",
      href: "/dashboard/fiber-color-code",
    },
    {
      icon: DraftingCompassIcon,
      title: "CAD & GIS Converter",
      description:
        locale === "en"
          ? "Convert between KML, AutoCAD DXF, ESRI Shapefile, and CSV formats seamlessly."
          : "Konversi antara format KML, AutoCAD DXF, ESRI Shapefile, dan CSV secara mudah dan instan.",
      href: "/dashboard", // Links to dashboard overview where converters are listed
    },
    {
      icon: DatabaseIcon,
      title: "KML to Database HP",
      description:
        locale === "en"
          ? "Convert KML homepass data into structured databases with consistent naming and validation."
          : "Konversi data homepass KML ke database terstruktur dengan penamaan yang konsisten dan validasi otomatis.",
      href: "/dashboard/kml-database-hp",
    },
  ]

  return (
    <section
      ref={sectionRef}
      id="tools"
      data-play={dataPlay}
      className="relative isolate scroll-mt-24 py-16 sm:py-20 overflow-hidden"
    >
      {/* Lapisan ambient. Murni hiasan, jadi disembunyikan dari pembaca
          layar dan tidak pernah menangkap klik. */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div
          className="amb-blob bg-primary/35"
          style={{
            top: "4%",
            left: "-6%",
            width: 320,
            height: 320,
            ["--morph-d" as string]: "13s",
            ["--drift-d" as string]: "9s",
          }}
        />
        <div
          className="amb-blob bg-primary/25"
          style={{
            bottom: "2%",
            right: "-8%",
            width: 380,
            height: 380,
            ["--morph-d" as string]: "17s",
            ["--drift-d" as string]: "11s",
            animationDelay: "1.5s, 0.8s",
          }}
        />
        <div
          className="amb-orb"
          style={{
            top: "30%",
            right: "12%",
            width: 240,
            height: 240,
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--primary) 26%, transparent) 0%, transparent 70%)",
          }}
        />
        <div className="amb-scan" />
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-medium text-primary">
            {locale === "en" ? "Tools" : "Tool"}
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-balance font-display">
            <CharIn
              text={
                locale === "en"
                  ? "Built for fiber engineering workflows"
                  : "Dirancang untuk alur kerja teknik fiber"
              }
            />
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            {locale === "en"
              ? "A complete automation suite that replaces hours of manual data tasks with seconds of computation."
              : "Kerjaan yang biasanya makan waktu berjam-jam, sekarang selesai dalam hitungan detik."}
          </p>
        </div>

        <div
          className="stagger-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
        >
          {localizedFeatures.map((feature, i) => (
            <motion.div
              key={feature.title}
              style={{
                animationDelay: `${i * 60}ms`,
                // Dipakai CSS untuk menggeser fase gerak ambient tiap
                // ikon, supaya kedelapannya tidak bergerak serempak.
                ["--i" as string]: i,
              }}
              whileTap={{ scale: 0.97 }}
            >
              <Link
                href={feature.href}
                className="tool-card group relative block h-full overflow-hidden rounded-2xl border border-border bg-card/90 p-5 backdrop-blur-sm shadow-md shadow-black/5 dark:shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:border-primary/40 hover:bg-card/95 hover:shadow-xl hover:shadow-primary/10 hover:tech-border-glow active:border-primary/60 active:bg-card/95"
              >
                {/* Hardware blueprint corner brackets */}
                <div className="tech-bracket-tl opacity-30 group-hover:opacity-100 transition-opacity" />
                <div className="tech-bracket-tr opacity-30 group-hover:opacity-100 transition-opacity" />
                <div className="tech-bracket-bl opacity-30 group-hover:opacity-100 transition-opacity" />
                <div className="tech-bracket-br opacity-30 group-hover:opacity-100 transition-opacity" />

                {/* Glow effect */}
                <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-105 group-hover:ring-primary/40 group-active:bg-primary group-active:text-primary-foreground">
                    <feature.icon className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-all duration-300 group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>

                <h3 className="relative mt-5 text-base font-medium text-foreground group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="relative mt-2 text-xs leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Pita format yang didukung (primitif `ticker`).

            Isinya digandakan DUA KALI dan geserannya tepat -50%, jadi
            posisi akhir identik dengan posisi awal dan loop-nya mulus
            tanpa lompatan. Teks aslinya cukup dibaca sekali oleh pembaca
            layar — salinan keduanya murni visual. */}
        <div
          className="mt-14 overflow-hidden border-y border-border/60 py-3"
          style={{
            maskImage:
              "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
          }}
        >
          <div className="amb-ticker-row">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span
                key={i}
                aria-hidden={i >= TICKER_ITEMS.length ? "true" : undefined}
                className="flex items-center gap-6 pr-6 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap"
              >
                {item}
                <span className="text-primary">&middot;</span>
              </span>
            ))}
          </div>
        </div>

        {/* Pita kurva (primitif `kurva`).

            Ini yang mengisi ujung bawah seksi — sebelumnya berhenti mati
            setelah pita format. Jalurnya menggambar dirinya sendiri dan
            pulsa berjalan menyusurinya; jalur tengah sengaja memakai
            easing yang berbeda supaya bedanya kelihatan. */}
        <CurveBand className="mt-10 h-24 w-full text-primary sm:h-32" />
      </div>
    </section>
  )
}
