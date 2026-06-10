"use client"

import { motion } from "framer-motion"
import { Upload, Cpu, Download } from "lucide-react"
import { translations } from "@/lib/translations"

export function Workflow({ locale = "en" }: { locale?: string }) {
  const t = translations[locale as "en" | "id"] || translations.en

  const steps = [
    {
      icon: Upload,
      step: "01",
      title: t.workflow.step1,
      description: t.workflow.step1Desc,
    },
    {
      icon: Cpu,
      step: "02",
      title: t.workflow.step2,
      description: t.workflow.step2Desc,
    },
    {
      icon: Download,
      step: "03",
      title: t.workflow.step3,
      description: t.workflow.step3Desc,
    },
  ]

  return (
    <section className="relative isolate py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Workflow</p>
          <h2 className="mt-2 text-3xl sm:text-5xl font-semibold tracking-tight text-balance">
            {locale === "en" ? "From file to deliverable in three steps" : "Dari file ke hasil akhir dalam tiga langkah"}
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-5 relative">
          {/* Connecting line on desktop */}
          <div
            aria-hidden="true"
            className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"
          />

          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              whileTap={{ scale: 0.98 }}
              className="group relative rounded-2xl border border-border bg-card/90 p-6 backdrop-blur-sm shadow-md shadow-black/5 dark:shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-primary transition-all duration-300 group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground group-active:bg-primary group-active:text-primary-foreground">
                  <step.icon className="h-4 w-4" />
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {step.step}
                </span>
              </div>
              <h3 className="mt-5 text-base font-medium text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
