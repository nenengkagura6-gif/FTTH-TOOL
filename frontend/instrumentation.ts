// ==================================================
// Next.js Instrumentation
// Runs once when the server starts
// ==================================================

export async function register() {
    // Only run on server
    if (typeof window !== 'undefined') return

    // Validate environment variables on startup
    const { assertValidEnv } = await import('@/lib/env')
    assertValidEnv()

    const { default: log } = await import('@/lib/logger')
    log.info('🚀 FTTH Tool server started', {
        env: process.env.NODE_ENV,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    })
}
