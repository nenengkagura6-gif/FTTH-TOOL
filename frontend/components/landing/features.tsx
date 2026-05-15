"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Map, Database, ShieldCheck, ArrowUpRight } from "lucide-react"

const features = [
  {
    icon: Map,
    title: "KML to BOQ",
    description:
      "Auto-generate Bill of Quantities from KML files. Cable, splitter, and pole quantities computed in seconds.",
    href: "/dashboard/kml-boq",
  },
  {
    icon: Database,
    title: "KML to Database HP",
    description:
      "Convert KML homepass data into structured databases with consistent naming and validation.",
    href: "/dashboard/kml-database-hp",
  },
  {
    icon: ShieldCheck,
    title: "KML Duplicate Checker",
    description:
      "Detect duplicate HP and pole points across KML files before they hit production.",
    href: "/dashboard/kml-checker",
  },
]

export function Features() {
  return (
    <section
      id="tools"
      className="relative isolate scroll-mt-24 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Tools</p>
          <h2 className="mt-2 text-3xl sm:text-5xl font-semibold tracking-tight text-balance">
            Built for fiber engineering workflows
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            Three core tools that replace hours of manual KML processing with
            seconds of automation.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-5">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <Link
                href={feature.href}
                className="group relative block h-full overflow-hidden rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-card/60"
              >
                {/* Glow effect */}
                <div className="pointer-events-none absolute -top-32 -right-32 h-64 w-64 rounded-full bg-primary/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>

                <h3 className="relative mt-6 text-lg font-medium text-foreground">
                  {feature.title}
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
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
