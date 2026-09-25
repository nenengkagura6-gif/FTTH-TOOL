"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/auth-provider"
import { DashboardSidebar } from "./sidebar"
import { DashboardHeader } from "./header"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isAuthenticated, isLoading, profile } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login")
      return
    }

    // Akun yang ditangguhkan lewat panel admin (profiles.is_active = false)
    // sudah diblokir di level database — has_quota_remaining() mensyaratkan
    // is_active, dan policy INSERT processing_jobs memanggilnya. Tanpa
    // pengalihan ini user cuma melihat error penolakan yang tidak jelas
    // di setiap tool, tanpa pernah tahu akunnya ditangguhkan.
    if (!isLoading && isAuthenticated && profile && profile.is_active === false) {
      router.push("/account-suspended")
    }
  }, [isLoading, isAuthenticated, profile, router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
