"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { translations } from "@/lib/translations"

export function CtaBanner({ locale = "en" }: { locale?: string }) {
  const t = translations[locale as "en" | "id"] || translations.en

  return (
    <section className="relative isolate py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-card/40 px-8 py-16 sm:px-16 sm:py-20 text-center backdrop-blur-sm"
        >
          {/* Hardware blueprint corner brackets */}
          <div className="tech-bracket-tl opacity-60" />
          <div className="tech-bracket-tr opacity-60" />
          <div className="tech-bracket-bl opacity-60" />
          <div className="tech-bracket-br opacity-60" />

          {/* Glow */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[600px] rounded-full bg-primary/10 blur-[120px]" />
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-0 dot-bg opacity-40 radial-fade"
          />

          <div className="relative">
            <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-balance font-display">
              {t.ctaBanner.title}
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
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-white/30"
              >
                {t.nav.pricing}
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
