"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Bell, Menu, Search, LogOut, LayoutDashboard, History, Key, Globe, Sun, Moon } from "lucide-react"
import { useTheme } from "next-themes"
import { useAuth } from "@/components/auth/auth-provider"
import { toolMenuItems, TOOL_CATEGORIES, getToolsByCategory } from "@/lib/site-config"
import { dashboardTranslations } from "./dashboard-translations"
import { cn } from "@/lib/utils"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command"

interface HeaderProps {
  onMenuClick?: () => void
}

const headerT = {
  en: {
    searchPlaceholder: "Search tools, docs...",
    noResults: "No results found.",
    headingTools: "Tools",
    headingNav: "Navigation",
    headingSystem: "System",
    overview: "Dashboard Overview",
    history: "History",
    apiKeys: "API Keys",
    signOut: "Sign out",
    quotaUsed: "used",
  },
  id: {
    searchPlaceholder: "Cari fitur, dokumen...",
    noResults: "Hasil tidak ditemukan.",
    headingTools: "Fitur & Alat",
    headingNav: "Navigasi",
    headingSystem: "Sistem",
    overview: "Ringkasan Dasbor",
    history: "Riwayat",
    apiKeys: "Kunci API",
    signOut: "Keluar",
    quotaUsed: "digunakan",
  }
} as const

const notifT = {
  en: {
    title: "Notifications",
    markAllRead: "Mark all as read",
    noNotifications: "No new notifications",
  },
  id: {
    title: "Pemberitahuan",
    markAllRead: "Tandai semua dibaca",
    noNotifications: "Tidak ada pemberitahuan baru",
  }
} as const

export function DashboardHeader({ onMenuClick }: HeaderProps) {
  const { user, profile, signOut, isLoading } = useAuth()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [locale, setLocale] = React.useState<"en" | "id" | null>(null)
  const [mounted, setMounted] = React.useState(false)
  const { theme, setTheme } = useTheme()

  const [showNotifications, setShowNotifications] = React.useState(false)
  const [readIds, setReadIds] = React.useState<number[]>([3])

  const notifications = [
    {
      id: 1,
      title: {
        en: "System Update",
        id: "Pembaruan Sistem"
      },
      desc: {
        en: "KML Parser now supports custom Excel template schemas.",
        id: "Parser KML kini mendukung skema template Excel kustom."
      },
      time: {
        en: "5m ago",
        id: "5m yang lalu"
      }
    },
    {
      id: 2,
      title: {
        en: "Account Plan Active",
        id: "Paket Akun Aktif"
      },
      desc: {
        en: "Welcome to your active FTTH Tool account!",
        id: "Selamat datang di akun FTTH Tool aktif Anda!"
      },
      time: {
        en: "2h ago",
        id: "2j yang lalu"
      }
    },
    {
      id: 3,
      title: {
        en: "Documentation Updated",
        id: "Dokumentasi Diperbarui"
      },
      desc: {
        en: "API endpoints and guides are fully translated.",
        id: "Endpoint API dan panduan telah diterjemahkan sepenuhnya."
      },
      time: {
        en: "1d ago",
        id: "1h yang lalu"
      }
    }
  ]

  const notificationRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [])

  const unreadCount = notifications.filter((n) => !readIds.includes(n.id)).length

  React.useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem("locale")
    if (stored === "id" || stored === "en") {
      setLocale(stored)
    } else {
      setLocale("en")
    }

    const storedRead = localStorage.getItem("ftth_read_notification_ids")
    if (storedRead) {
      try {
        setReadIds(JSON.parse(storedRead))
      } catch (e) {
        // ignore
      }
    } else {
      localStorage.setItem("ftth_read_notification_ids", JSON.stringify([3]))
    }
  }, [])

  const currentLocale = locale || "en"
  const t = headerT[currentLocale]
  const dt = dashboardTranslations[currentLocale]

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User"
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  // Listen for Ctrl+K / Cmd+K to toggle search
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const toggleLanguage = () => {
    const nextLocale = currentLocale === "en" ? "id" : "en"
    localStorage.setItem("locale", nextLocale)
    window.location.reload()
  }

  const translateMenu = (title: string, desc: string | undefined) => {
    const translatedTitle = dt.menuTitle[title as keyof typeof dt.menuTitle] || title
    const translatedDesc = desc ? (dt.menuDesc[desc as keyof typeof dt.menuDesc] || desc) : undefined
    return { title: translatedTitle, description: translatedDesc }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/10 bg-background/70 backdrop-blur-xl px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        aria-label="Open sidebar"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Desktop Search Trigger */}
      <div className="flex-1 max-w-md hidden sm:block">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 w-full h-9 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-muted-foreground hover:border-white/20 hover:bg-white/[0.05] transition-all text-left cursor-pointer"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span>{t.searchPlaceholder}</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </div>

      {/* Mobile Search Trigger */}
      <div className="flex-1 sm:hidden flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Language Switcher */}
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-white/10 bg-white/[0.03] text-muted-foreground rounded-lg hover:border-white/30 hover:text-foreground transition-colors font-medium cursor-pointer"
        >
          <Globe className="h-3 w-3" />
          <span className="uppercase">{currentLocale === "en" ? "ID" : "EN"}</span>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center justify-center w-9 h-9 border border-white/10 bg-white/[0.03] text-muted-foreground rounded-lg hover:border-white/30 hover:text-foreground transition-colors cursor-pointer"
          aria-label="Toggle theme"
        >
          {mounted && theme === "dark" ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Notification menu */}
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
            className={cn(
              "relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-all cursor-pointer",
              showNotifications 
                ? "border-primary/30 bg-primary/5 text-primary" 
                : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary ring-1 ring-background animate-pulse" />
            )}
          </button>

          {showNotifications && (
            <div className="fixed top-16 left-4 right-4 w-auto md:absolute md:top-full md:right-0 md:left-auto md:w-96 rounded-xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 mb-1">
                <span className="text-sm font-semibold text-foreground">
                  {notifT[currentLocale].title}
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = notifications.map(n => n.id)
                      setReadIds(allIds)
                      localStorage.setItem("ftth_read_notification_ids", JSON.stringify(allIds))
                    }}
                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer"
                  >
                    {notifT[currentLocale].markAllRead}
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto space-y-1">
                {notifications.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    {notifT[currentLocale].noNotifications}
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        const newReadIds = [...readIds]
                        if (!newReadIds.includes(n.id)) {
                          newReadIds.push(n.id)
                          setReadIds(newReadIds)
                          localStorage.setItem("ftth_read_notification_ids", JSON.stringify(newReadIds))
                        }
                      }}
                      className={cn(
                        "w-full text-left flex gap-3 rounded-lg p-2.5 transition-all text-sm cursor-pointer",
                        readIds.includes(n.id) 
                          ? "text-muted-foreground hover:bg-white/5" 
                          : "bg-white/[0.02] text-foreground hover:bg-white/5 border-l-2 border-primary pl-2"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={cn("font-medium truncate text-xs sm:text-sm", !readIds.includes(n.id) && "text-foreground")}>
                            {n.title[currentLocale]}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {n.time[currentLocale]}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {n.desc[currentLocale]}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="group relative">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5 transition-colors"
            aria-label="User menu"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={displayName}
                className="h-8 w-8 rounded-full ring-1 ring-white/10"
              />
            ) : (
              <div
                className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 ring-1 ring-white/10 flex items-center justify-center text-xs font-medium"
              >
                {isLoading ? "..." : initials}
              </div>
            )}
            <span className="hidden sm:block text-sm text-muted-foreground truncate max-w-[120px]">
              {isLoading ? "Loading..." : displayName}
            </span>
          </button>

          {/* Dropdown */}
          <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute right-0 top-full mt-1 w-56 rounded-xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl p-1.5 z-50">
            <div className="px-3 py-2 border-b border-white/10 mb-1">
              <p className="text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              {profile && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-primary/20 capitalize">
                    {profile.plan}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {profile.quota_used}/{profile.quota_limit} {t.quotaUsed}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {t.signOut}
            </button>
          </div>
        </div>
      </div>

      {/* Global Command Search Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t.searchPlaceholder} />
        <CommandList className="border-t border-white/5 p-1 bg-card">
          <CommandEmpty>{t.noResults}</CommandEmpty>
          {TOOL_CATEGORIES.map((category) => {
              const tools = getToolsByCategory(category.id)
              if (tools.length === 0) return null
              const heading = category.label[currentLocale as "en" | "id"]
              return (
                <CommandGroup key={category.id} heading={heading}>
                  {tools.map((item) => {
                    const translation = translateMenu(item.title, item.description)
                    return (
                      <CommandItem
                        key={item.href}
                        value={item.title}
                        onSelect={() => {
                          setOpen(false)
                          router.push(item.href)
                        }}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5 rounded-lg text-foreground hover:text-primary transition-all duration-150"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-muted-foreground">
                          <item.icon className="h-4 w-4 shrink-0" />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="font-medium text-sm truncate">{translation.title}</span>
                          {translation.description && (
                            <span className="text-[10px] text-muted-foreground truncate">{translation.description}</span>
                          )}
                        </div>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )
            })}
          <CommandGroup heading={t.headingNav}>
            <CommandItem
              value="Dashboard Overview"
              onSelect={() => {
                setOpen(false)
                router.push("/dashboard")
              }}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5 rounded-lg text-foreground hover:text-primary transition-all duration-150"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-muted-foreground">
                <LayoutDashboard className="h-4 w-4 shrink-0" />
              </div>
              <span className="font-medium text-sm">{t.overview}</span>
            </CommandItem>
            <CommandItem
              value="Processing History"
              onSelect={() => {
                setOpen(false)
                router.push("/dashboard/history")
              }}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5 rounded-lg text-foreground hover:text-primary transition-all duration-150"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-muted-foreground">
                <History className="h-4 w-4 shrink-0" />
              </div>
              <span className="font-medium text-sm">{t.history}</span>
            </CommandItem>
            <CommandItem
              value="API Keys Manager"
              onSelect={() => {
                setOpen(false)
                router.push("/dashboard/api-keys")
              }}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5 rounded-lg text-foreground hover:text-primary transition-all duration-150"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-muted-foreground">
                <Key className="h-4 w-4 shrink-0" />
              </div>
              <span className="font-medium text-sm">{t.apiKeys}</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t.headingSystem}>
            <CommandItem
              value="Sign Out"
              onSelect={() => {
                setOpen(false)
                signOut()
              }}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-red-500/10 rounded-lg text-red-400 transition-all duration-150"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-500/10 text-red-400">
                <LogOut className="h-4 w-4 shrink-0" />
              </div>
              <span className="font-medium text-sm">{t.signOut}</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  )
}
