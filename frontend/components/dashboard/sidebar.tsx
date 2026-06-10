"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ChevronLeft,
  ChevronDown,
  Settings,
  HelpCircle,
  LogOut,
  X,
  Lock,
  Crown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  systemMenuItems,
  toolMenuItems,
  siteConfig,
  TOOL_CATEGORIES,
  getToolsByCategory,
  type ToolCategory,
  type DashboardMenuItem,
} from "@/lib/site-config"
import { useAuth } from "@/components/auth/auth-provider"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useUpgradeModal } from "@/components/upgrade-modal"
import { dashboardTranslations } from "./dashboard-translations"

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

const STORAGE_KEY = "sidebar-collapsed-categories"

// Category accent color map for dynamic class resolution
const categoryAccentMap: Record<string, {
  dot: string
  barGradient: string
  activeBg: string
  activeBorder: string
  activeText: string
}> = {
  violet: {
    dot: "bg-gradient-to-br from-violet-500 to-blue-500",
    barGradient: "from-violet-500/60 to-blue-500/60",
    activeBg: "bg-violet-500/10",
    activeBorder: "border-l-violet-500",
    activeText: "text-violet-400",
  },
  cyan: {
    dot: "bg-gradient-to-br from-cyan-500 to-teal-500",
    barGradient: "from-cyan-500/60 to-teal-500/60",
    activeBg: "bg-cyan-500/10",
    activeBorder: "border-l-cyan-500",
    activeText: "text-cyan-400",
  },
  amber: {
    dot: "bg-gradient-to-br from-amber-500 to-orange-500",
    barGradient: "from-amber-500/60 to-orange-500/60",
    activeBg: "bg-amber-500/10",
    activeBorder: "border-l-amber-500",
    activeText: "text-amber-400",
  },
  emerald: {
    dot: "bg-gradient-to-br from-emerald-500 to-green-500",
    barGradient: "from-emerald-500/60 to-green-500/60",
    activeBg: "bg-emerald-500/10",
    activeBorder: "border-l-emerald-500",
    activeText: "text-emerald-400",
  },
}

export function DashboardSidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [locale, setLocale] = useState<"en" | "id">("en")
  const { user, profile, signOut } = useAuth()
  const { canAccess, plan, planInfo } = useFeatureAccess()
  const { showUpgradeModal } = useUpgradeModal()

  // Category collapse state
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const stored = localStorage.getItem("locale")
    if (stored === "id" || stored === "en") {
      setLocale(stored)
    }
  }, [])

  // Load collapsed categories from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setCollapsedCategories(JSON.parse(stored))
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  const toggleCategory = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = { ...prev, [categoryId]: !prev[categoryId] }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const dt = dashboardTranslations[locale]
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User"

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname === href || pathname.startsWith(href + "/")
  }

  // Check if any tool in a category is active
  const isCategoryActive = (categoryId: ToolCategory) => {
    return getToolsByCategory(categoryId).some((item) => isActive(item.href))
  }

  // Render a single menu item (shared by system items and tool items)
  const renderMenuItem = (item: DashboardMenuItem, accent?: typeof categoryAccentMap.violet) => {
    if (item.adminOnly && profile?.role !== "admin") return null

    const active = isActive(item.href)
    const isLocked = item.featureKey ? !canAccess(item.featureKey) : false
    const translatedTitle = dt.menuTitle[item.title as keyof typeof dt.menuTitle] || item.title

    if (isLocked) {
      return (
        <li key={item.href}>
          <button
            type="button"
            onClick={() => {
              if (item.featureKey) showUpgradeModal(item.featureKey)
              onMobileClose?.()
            }}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all w-full text-left",
              "text-muted-foreground/50 hover:bg-white/5 hover:text-muted-foreground",
            )}
          >
            <item.icon className="h-4 w-4 flex-shrink-0 opacity-40" />
            {!collapsed && (
              <>
                <span className="truncate flex-1 opacity-60">{translatedTitle}</span>
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400/80 border border-amber-500/20">
                  <Lock className="h-2.5 w-2.5" />
                  PRO
                </span>
              </>
            )}
            {collapsed && (
              <Lock className="absolute top-1 right-1 h-2.5 w-2.5 text-amber-400/60" />
            )}
          </button>
        </li>
      )
    }

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onMobileClose}
          className={cn(
            "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
            active
              ? cn(
                  "text-foreground",
                  accent ? accent.activeBg : "bg-primary/10",
                )
              : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
          )}
          aria-current={active ? "page" : undefined}
        >
          {active && (
            <motion.span
              layoutId="sidebar-active-indicator"
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-r-full",
                accent ? accent.activeText.replace("text-", "bg-") : "bg-primary",
              )}
              aria-hidden="true"
            />
          )}
          <item.icon
            className={cn(
              "h-4 w-4 flex-shrink-0 transition-colors",
              active && (accent ? accent.activeText : "text-primary"),
            )}
          />
          {!collapsed && (
            <span className="truncate">{translatedTitle}</span>
          )}
        </Link>
      </li>
    )
  }

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onMobileClose}
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed lg:sticky top-0 z-50 lg:z-30 h-screen flex-shrink-0 transition-all duration-300 ease-out",
          "bg-sidebar/90 backdrop-blur-xl border-r border-white/10",
          collapsed ? "lg:w-16" : "lg:w-64",
          "w-72 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Dashboard sidebar"
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
            <Link
              href="/"
              className="flex items-center gap-2"
              aria-label={siteConfig.name}
            >
              <div className="relative w-7 h-7 flex items-center justify-center flex-shrink-0">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10" />
                <div className="relative w-5 h-5">
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary top-0 left-1/2 -translate-x-1/2" />
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary/80 left-0 top-1/2 -translate-y-1/2" />
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary/80 right-0 top-1/2 -translate-y-1/2" />
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-primary bottom-0 left-1/2 -translate-x-1/2" />
                </div>
              </div>
              {!collapsed && (
                <span className="font-semibold tracking-tight whitespace-nowrap">
                  {siteConfig.name}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={onMobileClose}
              className="lg:hidden p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav */}
          <nav
            className="flex-1 overflow-y-auto p-3 sidebar-scroll"
            aria-label="Dashboard navigation"
          >
            {/* System items (flat list) */}
            <ul className="flex flex-col gap-1">
              {systemMenuItems.map((item) => renderMenuItem(item))}
            </ul>

            {/* Divider between system & tools */}
            <div className="my-3 h-px bg-white/[0.06]" />

            {/* Tool categories */}
            <div className="flex flex-col gap-1">
              {TOOL_CATEGORIES.map((category) => {
                const tools = getToolsByCategory(category.id)
                const isExpanded = !collapsedCategories[category.id]
                const hasActiveChild = isCategoryActive(category.id)
                const accent = categoryAccentMap[category.accentColor]
                const categoryLabel = category.label[locale]
                const categorySubtitle = category.subtitle[locale]

                return (
                  <div key={category.id} className="mb-1">
                    {/* Category Header */}
                    <button
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className={cn(
                        "group flex items-center gap-2 w-full rounded-lg px-3 py-2 transition-all",
                        "hover:bg-white/[0.04]",
                        hasActiveChild && !isExpanded && "bg-white/[0.03]",
                        collapsed && "lg:justify-center lg:px-0",
                      )}
                      aria-expanded={isExpanded}
                      aria-controls={`category-${category.id}`}
                    >
                      {/* Gradient accent dot */}
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0 transition-shadow",
                          accent.dot,
                          hasActiveChild && "shadow-[0_0_6px_1px] shadow-current",
                        )}
                      />

                      {!collapsed && (
                        <>
                          <div className="flex-1 text-left min-w-0">
                            <span className="text-xs font-semibold text-foreground/95 block leading-tight">
                              {categoryLabel}
                            </span>
                            {isExpanded && (
                              <span className="text-[11px] text-muted-foreground/50 block leading-tight mt-0.5 font-normal">
                                {categorySubtitle}
                              </span>
                            )}
                            {!isExpanded && (
                              <span className="text-[10px] text-muted-foreground/40 block leading-tight mt-0.5">
                                {tools.length} {locale === "id" ? "alat" : "tools"}
                              </span>
                            )}
                          </div>

                          <ChevronDown
                            className={cn(
                              "h-3 w-3 text-muted-foreground/40 transition-transform duration-200 flex-shrink-0",
                              !isExpanded && "-rotate-90",
                            )}
                          />
                        </>
                      )}
                    </button>

                    {/* Category Items */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          id={`category-${category.id}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="relative">
                            {/* Gradient left accent bar */}
                            {!collapsed && (
                              <div
                                className={cn(
                                  "absolute left-[18px] top-1 bottom-1 w-[2px] rounded-full bg-gradient-to-b opacity-20",
                                  accent.barGradient,
                                )}
                                aria-hidden="true"
                              />
                            )}

                            <ul className="flex flex-col gap-0.5 py-1 pl-1">
                              {tools.map((item) => renderMenuItem(item, accent))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="border-t border-white/10 p-3">
            <ul className="flex flex-col gap-1">
              <li>
                <Link
                  href={`/${locale}/docs`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                >
                  <HelpCircle className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>{locale === "id" ? "Dokumentasi" : "Docs"}</span>}
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/settings"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                >
                  <Settings className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>{locale === "id" ? "Pengaturan" : "Settings"}</span>}
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={signOut}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-red-400 transition-colors"
                >
                  <LogOut className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>{locale === "id" ? "Keluar" : "Sign out"}</span>}
                </button>
              </li>
            </ul>

            {/* User info + plan badge */}
            {!collapsed && user && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium truncate">{displayName}</p>
                  <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
                    planInfo.badge,
                  )}>
                    {plan !== 'free' && <Crown className="h-2.5 w-2.5" />}
                    {planInfo.label}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                {profile && (
                  <p className="text-[9px] text-muted-foreground mt-1 font-mono">
                    {profile.quota_used}/{profile.quota_limit} {locale === "id" ? "terpakai" : "used"}
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:flex mt-3 items-center justify-center w-full h-8 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronLeft
                className={cn(
                  "h-4 w-4 transition-transform",
                  collapsed && "rotate-180",
                )}
              />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
