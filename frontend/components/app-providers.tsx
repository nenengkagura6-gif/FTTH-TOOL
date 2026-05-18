'use client'

import { usePathname } from 'next/navigation'
import { AuthProvider } from '@/components/auth/auth-provider'
import { UpgradeModalProvider } from '@/components/upgrade-modal'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/auth/callback') {
    return <>{children}</>
  }

  return (
    <AuthProvider>
      <UpgradeModalProvider>{children}</UpgradeModalProvider>
    </AuthProvider>
  )
}
