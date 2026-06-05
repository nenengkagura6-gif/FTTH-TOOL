"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Bell, Menu, Search, LogOut, LayoutDashboard, History, Key } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { dashboardMenu } from "@/lib/site-config"
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

export function DashboardHeader({ onMenuClick }: HeaderProps) {
  const { user, profile, signOut, isLoading } = useAuth()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

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
          <span>Search tools, docs...</span>
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
        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>

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
                    {profile.quota_used}/{profile.quota_limit} used
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
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Global Command Search Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a tool name or action..." />
        <CommandList className="border-t border-white/5 p-1 bg-card">
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Tools">
            {dashboardMenu
              .filter((item) => item.href !== "/dashboard" && item.href !== "/admin")
              .map((item) => (
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
                    <span className="font-medium text-sm truncate">{item.title}</span>
                    {item.description && (
                      <span className="text-[10px] text-muted-foreground truncate">{item.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
          </CommandGroup>
          <CommandGroup heading="Navigation">
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
              <span className="font-medium text-sm">Dashboard Overview</span>
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
              <span className="font-medium text-sm">History</span>
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
              <span className="font-medium text-sm">API Keys</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="System">
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
              <span className="font-medium text-sm">Sign Out</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  )
}
