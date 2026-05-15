// ==================================================
// Auth Provider - React Context for Authentication
// Client-side auth state management
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
    signInWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>
    signInWithOAuth: (provider: Provider) => Promise<{ error: AuthError | null }>
    signUp: (email: string, password: string, metadata?: { full_name?: string }) => Promise<{ error: AuthError | null }>
    signOut: () => Promise<void>
    resetPassword: (email: string) => Promise<{ error: AuthError | null }>
    updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>
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
        const initializeAuth = async () => {
            try {
                // Get current session
                const { data: { session }, error } = await supabase.auth.getSession()
                
                if (error) {
                    console.error('Error getting session:', error)
                }
                
                if (session?.user) {
                    setUser(session.user)
                    await fetchProfile(session.user.id)
                }
            } catch (error) {
                console.error('Error initializing auth:', error)
            } finally {
                setIsLoading(false)
            }
        }
        
        initializeAuth()
        
        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('Auth state changed:', event)
                
                if (session?.user) {
                    setUser(session.user)
                    await fetchProfile(session.user.id)
                } else {
                    setUser(null)
                    setProfile(null)
                }
                
                setIsLoading(false)
                
                // Refresh router on auth state changes
                router.refresh()
            }
        )
        
        return () => {
            subscription.unsubscribe()
        }
    }, [supabase, router, fetchProfile])

    // Sign in with email
    const signInWithEmail = useCallback(async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        
        return { error }
    }, [supabase])

    // Sign in with OAuth (Google, etc.)
    const signInWithOAuth = useCallback(async (provider: Provider) => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        })
        
        return { error }
    }, [supabase])

    // Sign up
    const signUp = useCallback(async (
        email: string,
        password: string,
        metadata?: { full_name?: string }
    ) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: metadata,
                emailRedirectTo: `${window.location.origin}/auth/confirm`,
            },
        })
        
        return { error }
    }, [supabase])

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

    // Reset password
    const resetPassword = useCallback(async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/reset-password`,
        })
        
        return { error }
    }, [supabase])

    // Update password
    const updatePassword = useCallback(async (newPassword: string) => {
        const { error } = await supabase.auth.updateUser({
            password: newPassword,
        })
        
        return { error }
    }, [supabase])

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
        signInWithEmail,
        signInWithOAuth,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
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

// HOC for protected routes (optional, middleware handles most cases)
export function withAuth<P extends object>(
    Component: React.ComponentType<P>
): React.FC<P> {
    return function WithAuthComponent(props: P) {
        const { isAuthenticated, isLoading } = useAuth()
        const router = useRouter()
        
        useEffect(() => {
            if (!isLoading && !isAuthenticated) {
                router.push('/login')
            }
        }, [isLoading, isAuthenticated, router])
        
        if (isLoading) {
            return (
                <div className="flex items-center justify-center min-h-screen">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
            )
        }
        
        if (!isAuthenticated) {
            return null
        }
        
        return <Component {...props} />
    }
}
