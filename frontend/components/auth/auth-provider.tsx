// ==================================================
// Auth Provider - React Context for Authentication
// Client-side auth state management (Magic Link flow)
// ==================================================

'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { User, AuthError, Provider } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'

type Profile = Database['public']['Tables']['profiles']['Row']

interface AuthContextType {
    user: User | null
    profile: Profile | null
    isLoading: boolean
    isAuthenticated: boolean
    signInWithMagicLink: (email: string) => Promise<{ error: AuthError | null }>
    signInWithOAuth: (provider: Provider) => Promise<{ error: AuthError | null }>
    signOut: () => Promise<void>
    refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const supabase = getSupabaseClient()
    
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    
    const isAuthenticated = !!user

    // Fetch user profile
    const fetchProfile = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single()
            
            if (error) {
                console.error('Error fetching profile:', error)
                return
            }
            
            setProfile(data)
        } catch (error) {
            console.error('Error in fetchProfile:', error)
        }
    }, [supabase])

    // Initialize auth state
    useEffect(() => {
        let mounted = true
        
        const initializeAuth = async () => {
            try {
                // Timeout helper
                const withTimeout = <T,>(promise: Promise<T>, ms = 5000): Promise<T> => {
                    return Promise.race([
                        promise,
                        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
                    ])
                }

                // Get current session with timeout
                const { data: { session }, error } = await withTimeout(supabase.auth.getSession())
                
                if (error) {
                    console.error('Error getting session:', error)
                }
                
                if (mounted && session?.user) {
                    setUser(session.user)
                    // run in background without blocking
                    fetchProfile(session.user.id).catch(console.error)
                }
            } catch (error) {
                console.error('Error initializing auth:', error)
            } finally {
                if (mounted) setIsLoading(false)
            }
        }
        
        initializeAuth()
        
        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('Auth state changed:', event)
                if (!mounted) return
                
                setIsLoading(false) // always unblock UI immediately
                
                if (session?.user) {
                    setUser(session.user)
                    // fetch profile in background without blocking
                    fetchProfile(session.user.id).catch(console.error)
                } else {
                    setUser(null)
                    setProfile(null)
                }
                
                // Only refresh router on active auth state changes, not on initial mount
                if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                    router.refresh()
                }
            }
        )
        
        return () => {
            mounted = false
            subscription.unsubscribe()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // empty dependency array to prevent infinite loops

    // Get app URL (prefer env var, fallback to window.location.origin)
    const getAppUrl = useCallback(() => {
        // Gunakan env var jika tersedia, fallback ke current origin
        const envUrl = process.env.NEXT_PUBLIC_APP_URL
        if (envUrl) {
            return envUrl.replace(/\/$/, '') // hapus trailing slash
        }
        if (typeof window !== 'undefined') {
            return window.location.origin
        }
        return ''
    }, [])

    // Sign in with Magic Link (OTP via email)
    const signInWithMagicLink = useCallback(async (email: string) => {
        const appUrl = getAppUrl()
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${appUrl}/auth/callback`,
            },
        })
        
        return { error }
    }, [supabase, getAppUrl])

    // Sign in with OAuth (Google, etc.)
    const signInWithOAuth = useCallback(async (provider: Provider) => {
        const appUrl = getAppUrl()
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${appUrl}/auth/callback`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        })
        
        return { error }
    }, [supabase, getAppUrl])

    // Sign out
    const signOut = useCallback(async () => {
        try {
            await supabase.auth.signOut()
            setUser(null)
            setProfile(null)
            router.push('/')
        } catch (error) {
            console.error('Error signing out:', error)
        }
    }, [supabase, router])

    // Refresh profile manually
    const refreshProfile = useCallback(async () => {
        if (user?.id) {
            await fetchProfile(user.id)
        }
    }, [user, fetchProfile])

    const value: AuthContextType = {
        user,
        profile,
        isLoading,
        isAuthenticated,
        signInWithMagicLink,
        signInWithOAuth,
        signOut,
        refreshProfile,
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

// Custom hook for using auth
export function useAuth() {
    const context = useContext(AuthContext)
    
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    
    return context
}
