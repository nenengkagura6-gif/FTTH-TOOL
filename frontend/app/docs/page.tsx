"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function DocsRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    const preferredLang =
      typeof navigator !== "undefined" && localStorage.getItem("locale") === "id"
        ? "id"
        : "en"
    router.replace(`/${preferredLang}/docs`)
  }, [router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
    </div>
  )
}
