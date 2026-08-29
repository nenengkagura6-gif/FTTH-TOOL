// ==================================================
// Supabase Client - Server-side
// Supports both Route Handlers and Server Components
// ==================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/supabase'

// Server Component / Route Handler client
export async function createClient() {
    const cookieStore = await cookies()

    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    try {
                        cookieStore.set({ name, value, ...options })
                    } catch (error) {
                        // Server Component - can't set cookies
                    }
                },
                remove(name: string, options: CookieOptions) {
                    try {
                        cookieStore.set({ name, value: '', ...options })
                    } catch (error) {
                        // Server Component - can't set cookies
                    }
                },
            },
        }
    )
}

// Middleware client (for route protection)
export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                    response.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                },
            },
        }
    )
}

// Admin/Service Role client (for privileged operations)
// WARNING: Only use in trusted server contexts
export function createServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing Supabase service role key')
    }

    // Use standard client with service key for admin operations
    // This bypasses RLS - use with extreme caution
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
    return createSupabaseClient<Database>(supabaseUrl, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
}

// Get current user from server context
export async function getCurrentUser() {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return null
    }

    return user
}

// Get current user with profile
export async function getCurrentUserWithProfile() {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return null
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (profileError) {
        console.error('Error fetching profile:', profileError)
        return { user, profile: null }
    }

    return { user, profile }
}

// Check if user has available quota
export async function checkUserQuota(userId: string): Promise<boolean> {
    const supabase = await createClient()
    
    const { data, error } = await supabase
        .rpc('check_user_quota', { p_user_id: userId })

    if (error) {
        console.error('Error checking quota:', error)
        return false
    }

    return data || false
}
