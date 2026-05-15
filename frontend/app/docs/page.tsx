import type { Metadata } from "next"
import Link from "next/link"
import {
  Rocket,
  BookOpen,
  Code2,
  Terminal,
  Map,
  Database,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react"
import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"

export const metadata: Metadata = {
  title: "Documentation — FTTH Tool",
  description:
    "Guides, API references, and tutorials for getting the most out of FTTH Tool.",
}

const sections = [
  {
    title: "Getting started",
    icon: Rocket,
    description: "Install, sign in, and run your first workflow.",
    links: [
      { label: "Quickstart", href: "#quickstart" },
      { label: "Account setup", href: "#account" },
      { label: "Your first KML upload", href: "#first-upload" },
    ],
  },
  {
    title: "Concepts",
    icon: BookOpen,
    description: "Understand how the platform models FTTH workflows.",
    links: [
      { label: "Workspaces", href: "#workspaces" },
      { label: "Files and clusters", href: "#clusters" },
      { label: "BOQ schemas", href: "#boq-schemas" },
    ],
  },
  {
    title: "Tools",
    icon: Map,
    description: "Reference for each tool in the platform.",
    links: [
      { label: "KML to BOQ", href: "/dashboard/kml-boq" },
      { label: "KML to Database HP", href: "/dashboard/kml-database-hp" },
      { label: "KML Duplicate Checker", href: "/dashboard/kml-checker" },
    ],
  },
  {
    title: "API",
    icon: Code2,
    description: "Programmatic access for Pro accounts.",
    links: [
      { label: "Authentication", href: "#api-auth" },
      { label: "Endpoints", href: "#api-endpoints" },
      { label: "Rate limits", href: "#api-limits" },
    ],
  },
]

export default function DocsPage() {
  return (
    <>
      <SiteNavbar />
      <main className="relative">
        <PageHeader
          eyebrow="Documentation"
          title="Everything you need to ship faster"
          description="Guides, API references, and tutorials for getting the most out of FTTH Tool."
        />

        {/* Section grid */}
        <section className="relative mx-auto max-w-6xl px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {sections.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <s.icon className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-medium">{s.title}</h2>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {s.description}
                </p>
                <ul className="mt-5 space-y-1.5">
                  {s.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {l.label}
                        <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Quickstart code block */}
        <section
          id="quickstart"
          className="relative mx-auto max-w-4xl px-6 py-12 scroll-mt-24"
        >
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Quickstart
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign up, upload a KML, and download your first BOQ in under five
            minutes.
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-card/60 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <div className="ml-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Terminal className="h-3 w-3" />
                <span>terminal</span>
              </div>
            </div>
            <pre className="p-5 font-mono text-xs leading-relaxed text-muted-foreground overflow-x-auto">
              <code>{`# 1. Sign in
$ open https://ftth-tool.example.com/login

# 2. Upload your KML
$ curl -F "file=@cluster.kml" \\
       -H "Authorization: Bearer $TOKEN" \\
       https://api.ftth-tool.example.com/v1/boq

# 3. Download the result
$ curl -O https://api.ftth-tool.example.com/v1/jobs/$ID/download`}</code>
            </pre>
          </div>
        </section>

        {/* Tool quick links */}
        <section className="relative mx-auto max-w-4xl px-6 pb-24">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Jump into a tool
          </h2>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href="/dashboard/kml-boq"
              className="group rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm hover:border-white/20 transition-colors"
            >
              <Map className="h-4 w-4 text-primary" />
              <p className="mt-3 text-sm font-medium group-hover:text-primary transition-colors">
                KML to BOQ
              </p>
            </Link>
            <Link
              href="/dashboard/kml-database-hp"
              className="group rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm hover:border-white/20 transition-colors"
            >
              <Database className="h-4 w-4 text-primary" />
              <p className="mt-3 text-sm font-medium group-hover:text-primary transition-colors">
                KML to Database HP
              </p>
            </Link>
            <Link
              href="/dashboard/kml-checker"
              className="group rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm hover:border-white/20 transition-colors"
            >
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="mt-3 text-sm font-medium group-hover:text-primary transition-colors">
                Duplicate Checker
              </p>
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
