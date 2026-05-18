'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      const supabase = getSupabaseClient()

      await supabase.auth.getSession()

      router.replace('/dashboard')
    }

    run()
  }, [router])

  return <div>Signing you in...</div>
}