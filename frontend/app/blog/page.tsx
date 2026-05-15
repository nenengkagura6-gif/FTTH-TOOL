"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Search, ArrowUpRight, Clock } from "lucide-react"
import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { cn } from "@/lib/utils"

const categories = [
  "All",
  "FTTH Tutorials",
  "OTDR Guide",
  "OPM Troubleshooting",
  "GPON Learning",
  "KML Mapping",
  "Fiber Engineering",
] as const

type Category = (typeof categories)[number]

interface Post {
  slug: string
  title: string
  excerpt: string
  category: Exclude<Category, "All">
  readTime: string
  date: string
  featured?: boolean
}

const posts: Post[] = [
  {
    slug: "ftth-network-design-guide",
    title: "Complete guide to designing modern FTTH networks",
    excerpt:
      "From last-mile planning to splitter ratios, learn how to architect FTTH networks that scale.",
    category: "FTTH Tutorials",
    readTime: "12 min",
    date: "May 8, 2026",
    featured: true,
  },
  {
    slug: "reading-otdr-traces",
    title: "How to read OTDR traces like a senior engineer",
    excerpt:
      "Decode events, splices, and reflectance values from OTDR outputs.",
    category: "OTDR Guide",
    readTime: "8 min",
    date: "May 4, 2026",
  },
  {
    slug: "kml-best-practices",
    title: "KML best practices for FTTH rollouts",
    excerpt:
      "Naming conventions, folder structure, and styling that survive handoffs.",
    category: "KML Mapping",
    readTime: "6 min",
    date: "Apr 29, 2026",
  },
  {
    slug: "opm-troubleshooting",
    title: "Fixing common OPM measurement issues in the field",
    excerpt:
      "Calibration, connector cleaning, and reference launch cables explained.",
    category: "OPM Troubleshooting",
    readTime: "7 min",
    date: "Apr 22, 2026",
  },
  {
    slug: "gpon-vs-xgs-pon",
    title: "GPON vs XGS-PON: choosing the right architecture",
    excerpt:
      "Bandwidth, optical budget, and CapEx tradeoffs for greenfield deployments.",
    category: "GPON Learning",
    readTime: "10 min",
    date: "Apr 14, 2026",
  },
  {
    slug: "boq-from-kml",
    title: "Generating accurate BOQs straight from KML files",
    excerpt:
      "Avoid manual quantity errors and standardize your BOQ pipeline.",
    category: "Fiber Engineering",
    readTime: "9 min",
    date: "Apr 6, 2026",
  },
  {
    slug: "fiber-splice-loss",
    title: "Understanding fiber splice loss and how to minimize it",
    excerpt:
      "Mechanical vs fusion, cleave quality, and acceptable thresholds.",
    category: "Fiber Engineering",
    readTime: "5 min",
    date: "Mar 30, 2026",
  },
]

export default function BlogPage() {
  const [active, setActive] = useState<Category>("All")
  const [query, setQuery] = useState("")

  const featured = posts.find((p) => p.featured)
  const filtered = useMemo(() => {
    return posts
      .filter((p) => !p.featured)
      .filter((p) => active === "All" || p.category === active)
      .filter(
        (p) =>
          !query ||
          p.title.toLowerCase().includes(query.toLowerCase()) ||
          p.excerpt.toLowerCase().includes(query.toLowerCase()),
      )
  }, [active, query])

  return (
    <>
      <SiteNavbar />
      <main className="relative">
        <PageHeader
          eyebrow="Blog"
          title="Field notes from FTTH engineers"
          description="Tutorials, case studies, and tooling deep-dives for fiber engineering teams."
        />

        <section className="relative mx-auto max-w-6xl px-6 pb-24">
          {/* Search + categories */}
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between mb-10">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search articles..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-10 rounded-full border border-white/10 bg-white/[0.03] pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActive(c)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs border transition-colors",
                    active === c
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white/[0.03] text-muted-foreground border-white/10 hover:border-white/30 hover:text-foreground",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Featured */}
          {featured && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="mb-12"
            >
              <Link
                href={`/blog/${featured.slug}`}
                className="group relative grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 rounded-3xl border border-white/10 bg-card/40 p-6 sm:p-8 backdrop-blur-sm transition-all hover:border-white/20"
              >
                <div className="relative aspect-[16/9] lg:aspect-auto rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-transparent">
                  <div className="absolute inset-0 dot-bg opacity-40" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-6xl font-mono text-primary/60">
                      FTTH
                    </span>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-xs font-medium text-primary">
                    Featured · {featured.category}
                  </span>
                  <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-balance group-hover:text-primary transition-colors">
                    {featured.title}
                  </h2>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    {featured.excerpt}
                  </p>
                  <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{featured.date}</span>
                    <span className="h-1 w-1 rounded-full bg-white/20" />
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {featured.readTime}
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          )}

          {/* Article grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((post, i) => (
              <motion.article
                key={post.slug}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
              >
                <Link
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col h-full rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden hover:border-white/20 transition-colors"
                >
                  <div className="relative aspect-[16/10] bg-gradient-to-br from-primary/15 via-primary/[0.04] to-transparent overflow-hidden">
                    <div className="absolute inset-0 grid-bg opacity-50" />
                    <div className="absolute top-3 left-3">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-primary bg-primary/10 ring-1 ring-primary/30 rounded-full px-2 py-0.5">
                        {post.category}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col flex-1 p-5">
                    <h3 className="text-base font-medium text-balance group-hover:text-primary transition-colors">
                      {post.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-2">
                      {post.excerpt}
                    </p>
                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{post.date}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {post.readTime}
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.article>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="mt-16 text-center text-sm text-muted-foreground">
              No articles match your filters.
            </div>
          )}

          {/* Newsletter / related */}
          <div className="mt-20 rounded-3xl border border-white/10 bg-card/40 p-8 sm:p-10 backdrop-blur-sm text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Get FTTH insights weekly
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No spam. Unsubscribe anytime.
            </p>
            <form className="mt-6 flex flex-col sm:flex-row max-w-md mx-auto gap-2">
              <input
                type="email"
                required
                placeholder="you@company.com"
                className="flex-1 h-10 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 h-10 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Subscribe
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
