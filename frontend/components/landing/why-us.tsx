"use client"

import { motion } from "framer-motion"
import { Zap, Lock, Globe, Code2 } from "lucide-react"

const reasons = [
  {
    icon: Zap,
    title: "Built for speed",
    description:
      "Process thousands of points in under a minute. No more waiting for manual checks.",
  },
  {
    icon: Lock,
    title: "Privacy first",
    description:
      "Files are processed in isolated workers and removed after delivery. We never train on your data.",
  },
  {
    icon: Globe,
    title: "Telecom-native",
    description:
      "Designed by FTTH engineers who understand BOQ, HP, splitters, and PON architecture.",
  },
  {
    icon: Code2,
    title: "API ready",
    description:
      "Plug our tools into your CI/CD or planning systems with a documented HTTP API.",
  },
]

export function WhyUs() {
  return (
    <section className="relative isolate py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          <div>
            <p className="text-sm font-medium text-primary">Why FTTH Tool</p>
            <h2 className="mt-2 text-3xl sm:text-5xl font-semibold tracking-tight text-balance">
              The fastest path from KML chaos to clean deliverables
            </h2>
            <p className="mt-5 text-muted-foreground leading-relaxed text-pretty">
              We replace spreadsheet wizardry and one-off scripts with a
              cohesive platform that scales from a single project to a national
              rollout.
            </p>

            <dl className="mt-10 grid grid-cols-2 gap-6 max-w-md">
              <div>
                <dt className="text-3xl font-semibold text-foreground">
                  10x
                </dt>
                <dd className="mt-1 text-xs text-muted-foreground">
                  Faster than manual review
                </dd>
              </div>
              <div>
                <dt className="text-3xl font-semibold text-foreground">
                  99.9%
                </dt>
                <dd className="mt-1 text-xs text-muted-foreground">
                  Platform uptime
                </dd>
              </div>
              <div>
                <dt className="text-3xl font-semibold text-foreground">
                  2.4M+
                </dt>
                <dd className="mt-1 text-xs text-muted-foreground">
                  HP points processed
                </dd>
              </div>
              <div>
                <dt className="text-3xl font-semibold text-foreground">
                  120+
                </dt>
                <dd className="mt-1 text-xs text-muted-foreground">
                  Engineering teams
                </dd>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {reasons.map((r, i) => (
              <motion.div
                key={r.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <r.icon className="h-4 w-4" />
                </div>
                <h3 className="mt-4 text-sm font-medium text-foreground">
                  {r.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {r.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
