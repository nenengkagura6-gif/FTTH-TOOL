// ==================================================
// Next.js Middleware - Route Protection
// Authentication & Authorization
// ==================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/server'

// Define route patterns
const PUBLIC_ROUTES = [
    '/',
    '/login',
    '/auth/callback',
    '/auth/confirm',
    '/about',
    '/pricing',
    '/blog',
    '/docs',
    '/api/public',
]

const AUTH_ROUTES = [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
]

const PROTECTED_ROUTES = [
    '/dashboard',
    '/dashboard/:path*',
    '/admin',
    '/admin/:path*',
    '/api/jobs',
    '/api/upload',
    '/api/keys',
    '/api/analytics',
]

const ADMIN_ROUTES = [
    '/admin',
    '/admin/:path*',
]

// Check if route matches pattern
function matchesRoute(pathname: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
        if (pattern.includes(':path*')) {
            const base = pattern.replace('/:path*', '')
            return pathname === base || pathname.startsWith(base + '/')
        }
        return pathname === pattern || pathname.startsWith(pattern + '/')
    })
}

// Check if route is public
function isPublicRoute(pathname: string): boolean {
    // Static files and API routes
    if (pathname.startsWith('/_next/') || 
        pathname.startsWith('/static/') ||
        pathname.startsWith('/api/auth/')) {
        return true
    }
    return matchesRoute(pathname, PUBLIC_ROUTES)
}

// Main middleware function
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    
    // Create response and Supabase client
    const response = NextResponse.next()
    const supabase = createMiddlewareClient(request, response)
    
    try {
        // Refresh session if expired
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
            console.error('Session error:', sessionError)
        }
        
        const isAuthenticated = !!session
        const user = session?.user
        
        // Get user profile for additional checks
        let userProfile = null
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('plan, is_active, quota_used, quota_limit, role')
                .eq('id', user.id)
                .single()
            userProfile = profile
        }
        
        // Handle auth routes (redirect to dashboard if already logged in)
        if (matchesRoute(pathname, AUTH_ROUTES) && isAuthenticated) {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
        
        // Handle protected routes
        if (matchesRoute(pathname, PROTECTED_ROUTES)) {
            if (!isAuthenticated) {
                // Redirect to login with return URL
                const loginUrl = new URL('/login', request.url)
                loginUrl.searchParams.set('returnTo', pathname)
                return NextResponse.redirect(loginUrl)
            }
            
            // Check if user account is active
            if (userProfile && !userProfile.is_active) {
                return NextResponse.redirect(new URL('/account-suspended', request.url))
            }
            
            // Check quota for upload/processing routes
            if (pathname.includes('/upload') || pathname.includes('/process')) {
                if (userProfile && userProfile.quota_used >= userProfile.quota_limit) {
                    // Redirect to quota exceeded page or return error
                    if (pathname.startsWith('/api/')) {
                        return NextResponse.json(
                            { error: 'Quota exceeded', code: 'QUOTA_EXCEEDED' },
                            { status: 429 }
                        )
                    }
                    return NextResponse.redirect(new URL('/quota-exceeded', request.url))
                }
            }
        }
        
        // Handle admin routes
        if (matchesRoute(pathname, ADMIN_ROUTES)) {
            if (!isAuthenticated) {
                return NextResponse.redirect(new URL('/login', request.url))
            }
            
            // Check for admin role
            if (userProfile?.role !== 'admin') {
                log.security.suspicious(user.id, 'Unauthorized Admin Access Attempt', { pathname })
                return NextResponse.redirect(new URL('/dashboard', request.url))
            }
        }
        
        // Add security headers
        response.headers.set('X-Frame-Options', 'DENY')
        response.headers.set('X-Content-Type-Options', 'nosniff')
        response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
        response.headers.set(
            'Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' blob: data: https://*.googleusercontent.com; " +
            "font-src 'self'; " +
            "connect-src 'self' https://*.supabase.co https://accounts.google.com; " +
            "frame-src https://accounts.google.com;"
        )
        
        return response
        
    } catch (error) {
        console.error('Middleware error:', error)
        
        // On error, allow request but log
        // In production, you might want to redirect to error page
        return response
    }
}

// Configure which routes to run middleware on
export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
