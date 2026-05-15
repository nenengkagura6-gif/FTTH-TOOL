import Link from "next/link"
import { Github, Twitter, Linkedin } from "lucide-react"
import { footerLinks, siteConfig } from "@/lib/site-config"

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/10 bg-background">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative w-7 h-7 flex items-center justify-center">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10" />
                <div className="relative w-5 h-5">
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary top-0 left-1/2 -translate-x-1/2" />
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary/80 left-0 top-1/2 -translate-y-1/2" />
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary/80 right-0 top-1/2 -translate-y-1/2" />
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary bottom-0 left-1/2 -translate-x-1/2" />
                </div>
              </div>
              <span className="font-semibold tracking-tight">
                {siteConfig.name}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {siteConfig.description}
            </p>
            <div className="flex items-center gap-3 mt-5">
              <a
                href="#"
                aria-label="Twitter"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/30 transition-colors"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="GitHub"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/30 transition-colors"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="LinkedIn"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/30 transition-colors"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground mb-4">Product</h3>
            <ul className="space-y-3">
              {footerLinks.product.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground mb-4">Company</h3>
            <ul className="space-y-3">
              {footerLinks.company.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground mb-4">Legal</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {siteConfig.org}. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Built for fiber engineers who ship faster.
          </p>
        </div>
      </div>
    </footer>
  )
}
