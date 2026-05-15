"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ChevronLeft,
  Settings,
  HelpCircle,
  LogOut,
  X,
  Lock,
  Crown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { dashboardMenu, siteConfig } from "@/lib/site-config"
import { useAuth } from "@/components/auth/auth-provider"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useUpgradeModal } from "@/components/upgrade-modal"
import { PLAN_INFO } from "@/lib/features"

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function DashboardSidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { user, profile, signOut } = useAuth()
  const { canAccess, plan, planInfo } = useFeatureAccess()
  const { showUpgradeModal } = useUpgradeModal()

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User"

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname === href || pathname.startsWith(href + "/")
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
            className="flex-1 overflow-y-auto p-3"
            aria-label="Dashboard navigation"
          >
            <p
              className={cn(
                "px-3 mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium",
                collapsed && "lg:hidden",
              )}
            >
              Tools
            </p>
            <ul className="flex flex-col gap-1">
              {dashboardMenu.map((item) => {
                if (item.adminOnly && profile?.role !== "admin") return null

                const active = isActive(item.href)
                const isLocked = item.featureKey ? !canAccess(item.featureKey) : false

                return (
                  <li key={item.href}>
                    {isLocked ? (
                      // Locked item — show upgrade modal on click
                      <button
                        type="button"
                        onClick={() => {
                          if (item.featureKey) {
                            showUpgradeModal(item.featureKey)
                          }
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
                            <span className="truncate flex-1 opacity-60">{item.title}</span>
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
                    ) : (
                      // Accessible item — normal link
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                          active
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        {active && (
                          <motion.span
                            layoutId="sidebar-active-indicator"
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-r-full bg-primary"
                            aria-hidden="true"
                          />
                        )}
                        <item.icon
                          className={cn(
                            "h-4 w-4 flex-shrink-0 transition-colors",
                            active && "text-primary",
                          )}
                        />
                        {!collapsed && (
                          <span className="truncate">{item.title}</span>
                        )}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Footer */}
          <div className="border-t border-white/10 p-3">
            <ul className="flex flex-col gap-1">
              <li>
                <Link
                  href="/docs"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                >
                  <HelpCircle className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>Docs</span>}
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/settings"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                >
                  <Settings className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>Settings</span>}
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={signOut}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-red-400 transition-colors"
                >
                  <LogOut className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>Sign out</span>}
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
