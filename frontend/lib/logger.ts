// ==================================================
// Structured Logger - Production-grade logging
// Uses pino for high-performance JSON logging
// ==================================================

import pino from 'pino'

const isDev = process.env.NODE_ENV === 'development'

// Base logger instance
const logger = pino({
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    ...(isDev
        ? {
              transport: {
                  target: 'pino-pretty',
                  options: {
                      colorize: true,
                      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                      ignore: 'pid,hostname',
                  },
              },
          }
        : {}),
    // Production: JSON output for log aggregators
    formatters: {
        level: (label: string) => ({ level: label }),
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    base: {
        service: 'ftth-tool',
        env: process.env.NODE_ENV || 'development',
    },
})

// ============================================
// Contextual loggers with user/request info
// ============================================

export interface LogContext {
    userId?: string
    endpoint?: string
    method?: string
    ip?: string
    userAgent?: string
    requestId?: string
    jobId?: string
    toolName?: string
    [key: string]: unknown
}

function createContextLogger(context: LogContext) {
    return logger.child(context)
}

// ============================================
// Domain-specific logging functions
// ============================================

export const log = {
    // --- Auth Events ---
    auth: {
        login(userId: string, provider: string, ip?: string) {
            logger.info({ userId, provider, ip, event: 'auth.login' }, 'User logged in')
        },
        logout(userId: string) {
            logger.info({ userId, event: 'auth.logout' }, 'User logged out')
        },
        signup(userId: string, email: string, provider: string) {
            logger.info({ userId, email, provider, event: 'auth.signup' }, 'New user signed up')
        },
        failed(email: string, reason: string, ip?: string) {
            logger.warn({ email, reason, ip, event: 'auth.failed' }, 'Authentication failed')
        },
    },

    // --- API Request Events ---
    api: {
        request(ctx: LogContext & { status?: number; durationMs?: number }) {
            const level = (ctx.status || 200) >= 500 ? 'error' : (ctx.status || 200) >= 400 ? 'warn' : 'info'
            logger[level](
                {
                    ...ctx,
                    event: 'api.request',
                },
                `${ctx.method} ${ctx.endpoint} ${ctx.status} (${ctx.durationMs}ms)`
            )
        },
        error(ctx: LogContext, error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error))
            logger.error(
                {
                    ...ctx,
                    event: 'api.error',
                    error: {
                        message: err.message,
                        name: err.name,
                        // Only include stack in development
                        ...(isDev ? { stack: err.stack } : {}),
                    },
                },
                `API error: ${ctx.method} ${ctx.endpoint}`
            )
        },
    },

    // --- Job Events ---
    job: {
        created(userId: string, jobId: string, toolName: string, filename: string) {
            logger.info(
                { userId, jobId, toolName, filename, event: 'job.created' },
                `Job created: ${toolName} - ${filename}`
            )
        },
        started(jobId: string, toolName: string) {
            logger.info({ jobId, toolName, event: 'job.started' }, `Job started: ${jobId}`)
        },
        completed(jobId: string, toolName: string, durationMs: number) {
            logger.info(
                { jobId, toolName, durationMs, event: 'job.completed' },
                `Job completed: ${jobId} (${durationMs}ms)`
            )
        },
        failed(jobId: string, toolName: string, error: string) {
            logger.error(
                { jobId, toolName, error, event: 'job.failed' },
                `Job failed: ${jobId} - ${error}`
            )
        },
        cancelled(userId: string, jobId: string) {
            logger.info({ userId, jobId, event: 'job.cancelled' }, `Job cancelled: ${jobId}`)
        },
    },

    // --- Upload Events ---
    upload: {
        started(userId: string, filename: string, sizeBytes: number) {
            logger.info(
                { userId, filename, sizeBytes, event: 'upload.started' },
                `Upload started: ${filename} (${(sizeBytes / 1024 / 1024).toFixed(2)}MB)`
            )
        },
        completed(userId: string, filename: string, sizeBytes: number, durationMs: number) {
            logger.info(
                { userId, filename, sizeBytes, durationMs, event: 'upload.completed' },
                `Upload completed: ${filename}`
            )
        },
        rejected(userId: string, filename: string, reason: string) {
            logger.warn(
                { userId, filename, reason, event: 'upload.rejected' },
                `Upload rejected: ${filename} - ${reason}`
            )
        },
    },

    // --- Quota Events ---
    quota: {
        checked(userId: string, used: number, limit: number) {
            logger.debug({ userId, used, limit, event: 'quota.checked' }, `Quota: ${used}/${limit}`)
        },
        exceeded(userId: string, used: number, limit: number) {
            logger.warn(
                { userId, used, limit, event: 'quota.exceeded' },
                `Quota exceeded: ${used}/${limit}`
            )
        },
        incremented(userId: string, newUsed: number) {
            logger.debug({ userId, newUsed, event: 'quota.incremented' }, `Quota incremented to ${newUsed}`)
        },
    },

    // --- Security Events ---
    security: {
        rateLimited(ip: string, endpoint: string, userId?: string) {
            logger.warn(
                { ip, endpoint, userId, event: 'security.rate_limited' },
                `Rate limited: ${ip} on ${endpoint}`
            )
        },
        unauthorized(endpoint: string, ip?: string, reason?: string) {
            logger.warn(
                { endpoint, ip, reason, event: 'security.unauthorized' },
                `Unauthorized access: ${endpoint}`
            )
        },
        suspicious(description: string, context: Record<string, unknown>) {
            logger.error(
                { ...context, event: 'security.suspicious' },
                `Suspicious activity: ${description}`
            )
        },
    },

    // --- General ---
    info(message: string, context?: Record<string, unknown>) {
        logger.info(context || {}, message)
    },
    warn(message: string, context?: Record<string, unknown>) {
        logger.warn(context || {}, message)
    },
    error(message: string, error?: unknown, context?: Record<string, unknown>) {
        const err = error instanceof Error ? error : undefined
        logger.error(
            {
                ...context,
                ...(err
                    ? {
                          error: {
                              message: err.message,
                              name: err.name,
                              ...(isDev ? { stack: err.stack } : {}),
                          },
                      }
                    : {}),
            },
            message
        )
    },
    debug(message: string, context?: Record<string, unknown>) {
        logger.debug(context || {}, message)
    },
}

export { logger, createContextLogger }
export default log
