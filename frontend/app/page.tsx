"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function RootRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    // Check browser language
    const preferredLang =
      typeof navigator !== "undefined" && navigator.language.startsWith("id")
        ? "id"
        : "en"
    router.replace(`/${preferredLang}`)
  }, [router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
    </div>
  )
}
