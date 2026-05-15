"use client"

import { Bell, Menu, Search, LogOut } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"

interface HeaderProps {
  onMenuClick?: () => void
}

export function DashboardHeader({ onMenuClick }: HeaderProps) {
  const { user, profile, signOut, isLoading } = useAuth()

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User"
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

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

      <div className="flex-1 max-w-md hidden sm:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search tools, docs..."
            className="w-full h-9 rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 sm:hidden" />

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
    </header>
  )
}
