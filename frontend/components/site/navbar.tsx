"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Menu, X, Globe, Sun, Moon } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { siteConfig } from "@/lib/site-config"
import { translations } from "@/lib/translations"

function Logo({ locale = "en" }: { locale?: string }) {
  return (
    <Link
      href={`/${locale}`}
      className="flex items-center gap-2 group"
      aria-label={siteConfig.name}
    >
      <div className="relative w-7 h-7 flex items-center justify-center">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 group-hover:from-primary/50 transition-colors" />
        <div className="relative w-5 h-5 flex items-center justify-center">
          <span className="absolute w-1.5 h-1.5 rounded-full bg-primary top-0 left-1/2 -translate-x-1/2" />
          <span className="absolute w-1.5 h-1.5 rounded-full bg-primary/80 left-0 top-1/2 -translate-y-1/2" />
          <span className="absolute w-1.5 h-1.5 rounded-full bg-primary/80 right-0 top-1/2 -translate-y-1/2" />
          <span className="absolute w-1.5 h-1.5 rounded-full bg-primary bottom-0 left-1/2 -translate-x-1/2" />
        </div>
      </div>
      <span className="font-semibold tracking-tight text-foreground whitespace-nowrap">
        {siteConfig.name}
      </span>
    </Link>
  )
}

function AnimatedNavLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="group relative inline-flex items-start h-5 overflow-hidden text-sm whitespace-nowrap"
    >
      <div className="flex flex-col transition-transform duration-300 ease-out group-hover:-translate-y-1/2">
        <span className="text-muted-foreground h-5 flex items-center">{children}</span>
        <span className="text-foreground h-5 flex items-center">{children}</span>
      </div>
    </Link>
  )
}

export function SiteNavbar({ locale = "en" }: { locale?: string }) {
  const pathname = usePathname() || ""
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [shapeClass, setShapeClass] = useState("rounded-full")
  const shapeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const t = translations[locale as "en" | "id"] || translations.en

  const localizedNavItems = [
    { label: t.nav.home, href: `/${locale}` },
    { label: t.nav.tools, href: `/${locale}#tools` },
    { label: t.nav.blog, href: `/${locale}/blog` },
    { label: t.nav.docs, href: `/${locale}/docs` },
    { label: t.nav.pricing, href: `/${locale}/pricing` },
    { label: t.nav.about, href: `/${locale}/about` },
  ]

  useEffect(() => {
    setMounted(true)
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (mounted && typeof window !== "undefined" && locale) {
      localStorage.setItem("locale", locale)
    }
  }, [locale, mounted])

  useEffect(() => {
    if (shapeTimeoutRef.current) clearTimeout(shapeTimeoutRef.current)
    if (isOpen) {
      setShapeClass("rounded-2xl")
    } else {
      shapeTimeoutRef.current = setTimeout(() => {
        setShapeClass("rounded-full")
      }, 300)
    }
    return () => {
      if (shapeTimeoutRef.current) clearTimeout(shapeTimeoutRef.current)
    }
  }, [isOpen])

  const toggleLanguage = () => {
    const segments = pathname.split("/")
    if (segments[1] === "en" || segments[1] === "id") {
      segments[1] = segments[1] === "en" ? "id" : "en"
      router.push(segments.join("/"))
    } else {
      const nextLocale = locale === "en" ? "id" : "en"
      router.push(`/${nextLocale}`)
    }
  }

  return (
    <header
      className={cn(
        "fixed top-4 left-1/2 -translate-x-1/2 z-50",
        "flex flex-col items-start",
        "px-4 sm:px-5 pt-3 pb-2.5",
        "border border-white/10",
        "bg-background/60 backdrop-blur-xl",
        "w-[calc(100%-1.5rem)] sm:w-auto",
        "transition-all duration-300",
        scrolled && "shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]",
        shapeClass,
      )}
    >
      <div className="flex items-center justify-between w-full gap-x-6 sm:gap-x-8">
        <Logo locale={locale} />

        <nav
          className="hidden md:flex items-center gap-6"
          aria-label="Main navigation"
        >
          {localizedNavItems.map((item) => (
            <AnimatedNavLink key={item.href} href={item.href}>
              {item.label}
            </AnimatedNavLink>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {/* Language Switcher */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border border-white/10 bg-white/[0.03] text-muted-foreground rounded-full hover:border-white/30 hover:text-foreground transition-colors font-medium cursor-pointer"
          >
            <Globe className="h-3 w-3" />
            <span className="uppercase">{locale === "en" ? "ID" : "EN"}</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center justify-center w-8 h-8 border border-white/10 bg-white/[0.03] text-muted-foreground rounded-full hover:border-white/30 hover:text-foreground transition-colors cursor-pointer"
            aria-label="Toggle theme"
          >
            {mounted && theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>

          <Link
            href="/login"
            className="px-4 py-1.5 text-sm border border-white/10 bg-white/[0.03] text-muted-foreground rounded-full hover:border-white/30 hover:text-foreground transition-colors"
          >
            {t.nav.login}
          </Link>
          <div className="relative group">
            <div className="absolute inset-0 -m-1 rounded-full bg-primary/40 opacity-50 blur-md pointer-events-none transition-all duration-300 group-hover:opacity-80 group-hover:blur-lg group-hover:-m-2" />
            <Link
              href="/signup"
              className="relative z-10 inline-flex items-center px-4 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-full hover:bg-primary/90 transition-colors"
            >
              {t.nav.signup}
            </Link>
          </div>
        </div>

        <button
          type="button"
          className="md:hidden flex items-center justify-center w-9 h-9 text-foreground rounded-full hover:bg-white/5 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={cn(
          "md:hidden flex flex-col items-stretch w-full overflow-hidden transition-all duration-300 ease-out",
          isOpen
            ? "max-h-[600px] opacity-100 pt-4"
            : "max-h-0 opacity-0 pt-0 pointer-events-none",
        )}
      >
        <nav
          className="flex flex-col gap-1 text-base"
          aria-label="Mobile navigation"
        >
          {localizedNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors py-2 px-3 rounded-lg"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-white/10">
          {/* Mobile Language Switcher */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              toggleLanguage()
            }}
            className="flex items-center justify-center gap-1 px-4 py-2 text-sm text-center border border-white/10 bg-white/[0.03] text-foreground rounded-full hover:border-white/30 transition-colors cursor-pointer"
          >
            <Globe className="h-4 w-4" />
            <span>Switch to {locale === "en" ? "Bahasa Indonesia (ID)" : "English (EN)"}</span>
          </button>

          {/* Mobile Theme Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              setTheme(theme === "dark" ? "light" : "dark")
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm text-center border border-white/10 bg-white/[0.03] text-foreground rounded-full hover:border-white/30 transition-colors cursor-pointer"
          >
            {mounted && theme === "dark" ? (
              <>
                <Sun className="h-4 w-4" />
                <span>{locale === "en" ? "Switch to Light Mode" : "Ubah ke Mode Terang"}</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4" />
                <span>{locale === "en" ? "Switch to Dark Mode" : "Ubah ke Mode Gelap"}</span>
              </>
            )}
          </button>

          <Link
            href="/login"
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 text-sm text-center border border-white/10 bg-white/[0.03] text-foreground rounded-full hover:border-white/30 transition-colors"
          >
            {t.nav.login}
          </Link>
          <Link
            href="/signup"
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 text-sm text-center font-medium text-primary-foreground bg-primary rounded-full hover:bg-primary/90 transition-colors"
          >
            {t.nav.signup}
          </Link>
        </div>
      </div>
    </header>
  )
}
