// ==================================================
// Rate Limiter - In-memory sliding window
// Production: replace with Upstash Redis or similar
// ==================================================

interface RateLimitEntry {
    count: number
    resetAt: number
}

interface RateLimitConfig {
    /** Max requests per window */
    maxRequests: number
    /** Window size in seconds */
    windowSeconds: number
}

// In-memory store (works for single-instance deployments)
// For multi-instance: use Upstash Redis (@upstash/ratelimit)
const store = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
    const now = Date.now()
    if (now - lastCleanup < CLEANUP_INTERVAL) return
    lastCleanup = now

    for (const [key, entry] of store) {
        if (entry.resetAt < now) {
            store.delete(key)
        }
    }
}

export interface RateLimitResult {
    /** Whether the request is allowed */
    allowed: boolean
    /** Remaining requests in current window */
    remaining: number
    /** Max requests per window */
    limit: number
    /** When the current window resets (Unix timestamp ms) */
    resetAt: number
    /** Seconds until reset */
    retryAfter: number
}

/**
 * Check rate limit for a given key (IP, userId, etc.)
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
    cleanup()

    const now = Date.now()
    const windowMs = config.windowSeconds * 1000
    const entry = store.get(key)

    // No existing entry or window expired — create new
    if (!entry || entry.resetAt < now) {
        const resetAt = now + windowMs
        store.set(key, { count: 1, resetAt })
        return {
            allowed: true,
            remaining: config.maxRequests - 1,
            limit: config.maxRequests,
            resetAt,
            retryAfter: 0,
        }
    }

    // Within window
    if (entry.count < config.maxRequests) {
        entry.count++
        return {
            allowed: true,
            remaining: config.maxRequests - entry.count,
            limit: config.maxRequests,
            resetAt: entry.resetAt,
            retryAfter: 0,
        }
    }

    // Rate limited
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return {
        allowed: false,
        remaining: 0,
        limit: config.maxRequests,
        resetAt: entry.resetAt,
        retryAfter,
    }
}

// ============================================
// Pre-configured rate limiters per use case
// ============================================

export const rateLimits = {
    /** General API: 60 requests per minute */
    api: { maxRequests: 60, windowSeconds: 60 },

    /** Auth attempts: 5 per minute (prevent brute force) */
    auth: { maxRequests: 5, windowSeconds: 60 },

    /** Job creation: 10 per minute */
    jobCreate: { maxRequests: 10, windowSeconds: 60 },

    /** File uploads: 5 per minute */
    upload: { maxRequests: 5, windowSeconds: 60 },

    /** Heavy endpoints: 20 per minute */
    heavy: { maxRequests: 20, windowSeconds: 60 },
} as const

// ============================================
// Helper: Get client identifier from request
// ============================================

export function getClientIdentifier(request: Request, userId?: string): string {
    // Prefer userId for authenticated requests
    if (userId) return `user:${userId}`

    // Fall back to IP
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown'

    return `ip:${ip}`
}

/**
 * Get IP address from request headers
 */
export function getClientIP(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for')
    return forwarded?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown'
}
