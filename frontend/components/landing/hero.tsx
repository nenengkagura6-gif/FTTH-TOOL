"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { AnimatedBackground } from "@/components/site/animated-background"
import { translations } from "@/lib/translations"

export function Hero({ locale = "en" }: { locale?: string }) {
  const t = translations[locale as "en" | "id"] || translations.en

  return (
    <section className="relative isolate overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      <AnimatedBackground variant="grid" />

      <div className="relative mx-auto max-w-6xl px-6 text-center">

        {/*
          Headline menyebut transformasi konkret + jumlah tool yang bisa
          diverifikasi, bukan kata sifat ("Modern … Platform"). Angka 20
          cocok dengan daftar tool di lib/site-config.ts.
        */}
        <h1 className="mt-6 text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-balance leading-[1.05] font-display">
          {t.hero.titleLead}{" "}
          <span className="text-primary">{t.hero.titleAccent}</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed text-pretty">
          {t.hero.subtitle}
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t.hero.btnStart}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="#tools"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            {t.hero.btnExplore}
          </Link>
        </div>


      </div>
    </section>
  )
}
