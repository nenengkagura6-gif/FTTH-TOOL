// ==================================================
// Supabase Client - Browser/Client-side
// ==================================================

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

let clientInstance: SupabaseClient<Database> | null = null

export function getSupabaseClient(): SupabaseClient<Database> {
    if (clientInstance) return clientInstance

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables')
    }

    clientInstance = createBrowserClient<Database>(
        supabaseUrl,
        supabaseKey,
        {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                flowType: 'pkce',
            },
            cookieOptions: {
                // PKCE code verifier akan disimpan di cookie
                // memastikan tersedia saat callback dari OAuth provider
                maxAge: 60 * 60 * 24, // 24 hours
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
            },
        }
    )

    return clientInstance
}

// Hook-friendly client
export const supabase = getSupabaseClient()
