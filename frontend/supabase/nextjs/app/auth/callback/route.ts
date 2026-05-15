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
    
    if (code) {
        const supabase = await createClient()
        
        try {
            const { error } = await supabase.auth.exchangeCodeForSession(code)
            
            if (!error) {
                // Successful auth - redirect to dashboard
                return NextResponse.redirect(`${origin}${next}`)
            }
            
            console.error('Error exchanging code for session:', error)
            return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
            
        } catch (error) {
            console.error('Unexpected error in auth callback:', error)
            return NextResponse.redirect(`${origin}/login?error=unexpected_error`)
        }
    }
    
    // No code present - redirect to login
    return NextResponse.redirect(`${origin}/login`)
}
