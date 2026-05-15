"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"
import { AnimatedBackground } from "@/components/site/animated-background"

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      <AnimatedBackground variant="grid" />

      <div className="relative mx-auto max-w-6xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>New: KML Duplicate Checker now in beta</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-6 text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-balance leading-[1.05]"
        >
          Modern{" "}
          <span className="bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text text-transparent">
            FTTH Tool
          </span>{" "}
          Automation Platform
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed text-pretty"
        >
          Automate KML, database, and document telecom workflows in seconds.
          Built for fiber engineers, network planners, and field teams.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <div className="relative group">
            <div className="absolute inset-0 -m-1 rounded-full bg-primary/40 opacity-50 blur-lg transition-all duration-300 group-hover:opacity-80 group-hover:blur-xl" />
            <Link
              href="/signup"
              className="relative inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <Link
            href="#tools"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:border-white/30 hover:bg-white/[0.06]"
          >
            Explore Tools
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted-foreground"
        >
          <span>Trusted by engineering teams worldwide</span>
          <span className="hidden sm:block h-1 w-1 rounded-full bg-white/20" />
          <span>SOC2 ready</span>
          <span className="hidden sm:block h-1 w-1 rounded-full bg-white/20" />
          <span>99.9% uptime</span>
        </motion.div>
      </div>
    </section>
  )
}
