'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'

const AUTH_TIMEOUT_MS = 8000

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const supabase = getSupabaseClient()
        const params = new URLSearchParams(window.location.search)
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const code = params.get('code')
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const errorDescription = params.get('error_description') ?? params.get('error')
        const hashErrorDescription = hashParams.get('error_description') ?? hashParams.get('error')

        if (errorDescription || hashErrorDescription) {
          throw new Error(errorDescription ?? hashErrorDescription ?? 'Supabase returned an auth error.')
        }

        if (code) {
          const { error } = await withTimeout(
            supabase.auth.exchangeCodeForSession(code),
            'Supabase auth callback timed out while exchanging the login code.',
          )

          if (error) {
            throw error
          }
        } else if (accessToken && refreshToken) {
          const { error } = await withTimeout(
            supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            }),
            'Supabase auth callback timed out while saving the session.',
          )

          if (error) {
            throw error
          }
        }

        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          'Supabase auth callback timed out while reading the session.',
        )

        if (error) {
          throw error
        }

        if (!data.session) {
          throw new Error('No active session was found. Please sign in again.')
        }

        window.location.replace('/dashboard')
      } catch (err) {
        if (cancelled) return

        setError(err instanceof Error ? err.message : 'Unable to finish sign in.')
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold">
          {error ? 'Sign in failed' : 'Signing you in...'}
        </h1>

        <p className="mt-3 text-sm text-muted-foreground">
          {error
            ? error
            : 'Please wait while we finish connecting your account.'}
        </p>

        {error ? (
          <Link
            href="/login"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Back to login
          </Link>
        ) : (
          <noscript>
            <p className="mt-6 text-sm text-muted-foreground">
              JavaScript is required to complete sign in.
            </p>
          </noscript>
        )}
      </div>
    </main>
  )
}
