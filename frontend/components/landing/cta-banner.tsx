"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { translations } from "@/lib/translations"
import { useSectionPlay } from "@/components/landing/use-section-play"
import { CharIn } from "@/components/landing/char-in"
import { CurveBand } from "@/components/landing/curve-band"

export function CtaBanner({ locale = "en" }: { locale?: string }) {
  const t = translations[locale as "en" | "id"] || translations.en
  const { ref, dataPlay } = useSectionPlay<HTMLElement>()

  return (
    <section
      ref={ref}
      data-play={dataPlay}
      className="relative isolate py-16 sm:py-20"
    >
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          className="reveal relative overflow-hidden rounded-2xl border border-border bg-card/40 px-8 py-16 sm:px-16 sm:py-20 text-center backdrop-blur-sm"
        >
          {/* Hardware blueprint corner brackets */}
          <div className="tech-bracket-tl opacity-60" />
          <div className="tech-bracket-tr opacity-60" />
          <div className="tech-bracket-bl opacity-60" />
          <div className="tech-bracket-br opacity-60" />

          {/* Glow yang bernapas (primitif `orb-pulse`) dan garis sapu
              (primitif `scan-line`), menggantikan glow diam. */}
          <div className="pointer-events-none absolute inset-0">
            <div className="amb-orb absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[600px] bg-primary/10 blur-[120px]" />
            <div className="amb-scan" />
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-0 dot-bg opacity-40 radial-fade"
          />

          <div className="relative">
            <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-balance font-display">
<CharIn text={t.ctaBanner.title} step={22} />
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground text-pretty">
              {t.ctaBanner.subtitle}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <div className="relative group">
                <div className="absolute inset-0 -m-1 rounded-full bg-primary/40 opacity-60 blur-lg transition-all duration-300 group-hover:opacity-90" />
                <Link
                  href="/signup"
                  className="relative inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t.ctaBanner.btn}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <Link
                href={`/${locale}/pricing`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-border-strong"
              >
                {t.nav.pricing}
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Menutup halaman dengan gerak, bukan berhenti mati. */}
        <CurveBand className="mt-12 h-20 w-full text-primary sm:h-24" />
      </div>
    </section>
  )
}
