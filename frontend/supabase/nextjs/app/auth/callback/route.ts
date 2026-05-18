// ==================================================
// Auth Callback Handler
// Handles OAuth redirects and email confirmation
// ==================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'
    const errorDescription = searchParams.get('error_description')
    
    // Handle OAuth errors from provider
    if (searchParams.get('error')) {
        console.error('OAuth error:', searchParams.get('error'), errorDescription)
        return NextResponse.redirect(
            `${origin}/login?error=${searchParams.get('error')}&message=${encodeURIComponent(errorDescription || '')}`
        )
    }
    
    if (code) {
        const supabase = await createClient()
        
        try {
            const { error } = await supabase.auth.exchangeCodeForSession(code)
            
            if (!error) {
                // Successful auth - redirect to dashboard
                return NextResponse.redirect(`${origin}${next}`)
            }
            
            console.error('Error exchanging code for session:', error)
            
            // Provide specific error messages
            let errorCode = 'auth_callback_failed'
            if (error.message?.includes('code verifier')) {
                errorCode = 'pkce_verifier_missing'
            } else if (error.message?.includes('expired')) {
                errorCode = 'code_expired'
            }
            
            return NextResponse.redirect(`${origin}/login?error=${errorCode}`)
            
        } catch (error) {
            console.error('Unexpected error in auth callback:', error)
            return NextResponse.redirect(`${origin}/login?error=unexpected_error`)
        }
    }
    
    // No code present - redirect to login
    return NextResponse.redirect(`${origin}/login`)
}
