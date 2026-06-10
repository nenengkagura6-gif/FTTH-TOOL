'use client'

import { usePathname } from 'next/navigation'
import { AuthProvider } from '@/components/auth/auth-provider'
import { UpgradeModalProvider } from '@/components/upgrade-modal'
import { ThemeProvider } from '@/components/theme-provider'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/auth/callback') {
    return <>{children}</>
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <AuthProvider>
        <UpgradeModalProvider>{children}</UpgradeModalProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
