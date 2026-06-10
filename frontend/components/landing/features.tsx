"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { 
  Map, 
  Database, 
  ShieldCheck, 
  LineChart, 
  Scissors, 
  Activity, 
  Palette, 
  DraftingCompass, 
  ArrowUpRight 
} from "lucide-react"
import { translations } from "@/lib/translations"

export function Features({ locale = "en" }: { locale?: string }) {
  const t = translations[locale as "en" | "id"] || translations.en

  const localizedFeatures = [
    {
      icon: Map,
      title: "KML to BOQ",
      description:
        locale === "en"
          ? "Auto-generate Bill of Quantities (Excel) from KML files. Cable, splitter, and pole quantities computed in seconds."
          : "Hasilkan Bill of Quantities (Excel) secara otomatis dari file KML. Jumlah kabel, splitter, dan tiang dihitung dalam hitungan detik.",
      href: "/dashboard/kml-boq",
    },
    {
      icon: ShieldCheck,
      title: "KML Duplicate Checker",
      description:
        locale === "en"
          ? "Detect duplicate homepass and pole points across KML files before they hit production."
          : "Deteksi titik homepass dan tiang ganda di seluruh file KML sebelum masuk tahap produksi.",
      href: "/dashboard/kml-checker",
    },
    {
      icon: LineChart,
      title: "OTDR Trace Analyzer",
      description:
        locale === "en"
          ? "Parse Telcordia SOR files, plot dynamic event graphs, and export professional PDF trace reports."
          : "Urai file Telcordia SOR, gambar grafik event dinamis, dan ekspor laporan trace format PDF profesional.",
      href: "/dashboard/otdr-analyzer",
    },
    {
      icon: Scissors,
      title: "Splice Manager",
      description:
        locale === "en"
          ? "Generate FDT to FAT core splicing tables automatically with standard color code mapping."
          : "Hasilkan tabel splicing core FDT ke FAT otomatis dengan pemetaan kode warna serat standar.",
      href: "/dashboard/splice-manager",
    },
    {
      icon: Activity,
      title: "OPM Link Budget",
      description:
        locale === "en"
          ? "Calculate optical path loss and verify link power margin safety ranges using standard formulas."
          : "Hitung redaman jalur optik dan verifikasi margin cadangan daya aman menggunakan rumus standar telekomunikasi.",
      href: "/dashboard/opm-calculator",
    },
    {
      icon: Palette,
      title: "Fiber Color Code",
      description:
        locale === "en"
          ? "Lookup TIA-598-C and Telkom standard core and tube color schemes for any fiber count."
          : "Cari skema warna core dan tube standar TIA-598-C dan Telkom untuk nomor serat berapa pun.",
      href: "/dashboard/fiber-color-code",
    },
    {
      icon: DraftingCompass,
      title: "CAD & GIS Converter",
      description:
        locale === "en"
          ? "Convert between KML, AutoCAD DXF, ESRI Shapefile, and CSV formats seamlessly."
          : "Konversi antara format KML, AutoCAD DXF, ESRI Shapefile, dan CSV secara mudah dan instan.",
      href: "/dashboard", // Links to dashboard overview where converters are listed
    },
    {
      icon: Database,
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
      id="tools"
      className="relative isolate scroll-mt-24 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-medium text-primary">Tools</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-balance font-display">
            {locale === "en" 
              ? "Built for fiber engineering workflows" 
              : "Dirancang untuk alur kerja teknik fiber"}
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            {locale === "en"
              ? "A complete automation suite that replaces hours of manual data tasks with seconds of computation."
              : "Rangkaian alat otomatisasi lengkap yang menggantikan jam kerja manual dengan hitungan detik pemrosesan."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {localizedFeatures.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              whileTap={{ scale: 0.97 }}
            >
              <Link
                href={feature.href}
                className="group relative block h-full overflow-hidden rounded-2xl border border-border bg-card/90 p-5 backdrop-blur-sm shadow-md shadow-black/5 dark:shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:border-primary/40 hover:bg-card/95 hover:shadow-xl hover:shadow-primary/10 hover:tech-border-glow active:border-primary/60 active:bg-card/95"
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
      </div>
    </section>
  )
}
