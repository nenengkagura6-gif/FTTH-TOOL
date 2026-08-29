// ==================================================
// Request Logger - Logs API requests to usage_logs
// Call from API routes to track usage
// ==================================================

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import log from '@/lib/logger'
import { getClientIP } from '@/lib/rate-limit'

export interface RequestLogData {
    userId: string
    endpoint: string
    method: string
    statusCode: number
    processingTimeMs: number
    toolName?: string
    jobId?: string
    errorOccurred?: boolean
    request: NextRequest
}

/**
 * Log an API request to the usage_logs table (fire-and-forget)
 * Call this at the end of your API route handler
 */
export async function logRequest(data: RequestLogData): Promise<void> {
    try {
        const supabase = await createClient()
        const ip = getClientIP(data.request)
        const userAgent = data.request.headers.get('user-agent') || undefined

        const { error } = await supabase.from('usage_logs').insert({
            user_id: data.userId,
            endpoint: data.endpoint,
            method: data.method,
            request_count: 1,
            processing_time_ms: data.processingTimeMs,
            tool_name: data.toolName || null,
            job_id: data.jobId || null,
            user_agent: userAgent || null,
            ip_address: ip !== 'unknown' ? ip : null,
            status_code: data.statusCode,
            error_occurred: data.errorOccurred || false,
        })

        if (error) {
            // Don't throw — logging should never break the main flow
            log.warn('Failed to write usage_log', { error: error.message, endpoint: data.endpoint })
        }
    } catch (err) {
        // Silently fail — logging is best-effort
        log.warn('Exception in logRequest', { error: String(err) })
    }
}

/**
 * Helper: wraps an API handler to automatically log the request
 * Usage:
 *   export const GET = withLogging('/api/jobs', async (req, ctx) => { ... })
 */
export function withLogging(
    endpoint: string,
    handler: (request: NextRequest, context: { startTime: number }) => Promise<Response>
) {
    return async (request: NextRequest) => {
        const startTime = Date.now()

        const response = await handler(request, { startTime })

        // Fire-and-forget: log to usage_logs
        const userId = response.headers.get('x-user-id')
        if (userId) {
            const durationMs = Date.now() - startTime
            logRequest({
                userId,
                endpoint,
                method: request.method,
                statusCode: response.status,
                processingTimeMs: durationMs,
                errorOccurred: response.status >= 400,
                request,
            }).catch(() => {}) // ignore errors
        }

        return response
    }
}
