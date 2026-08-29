// ==================================================
// Audit Logger - Write audit events from app code
// Uses create_audit_log() PostgreSQL function
// ==================================================

import { createClient } from '@/lib/supabase/server'
import log from '@/lib/logger'

export type AuditEventType =
    | 'auth.login'
    | 'auth.logout'
    | 'auth.signup'
    | 'auth.password_reset'
    | 'auth.email_verified'
    | 'job.created'
    | 'job.completed'
    | 'job.failed'
    | 'file.uploaded'
    | 'file.downloaded'
    | 'file.deleted'
    | 'quota.exceeded'
    | 'subscription.changed'
    | 'api_key.created'
    | 'api_key.revoked'
    | 'security.suspicious_activity'

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical'

interface AuditLogInput {
    userId: string
    eventType: AuditEventType
    description: string
    severity?: AuditSeverity
    metadata?: Record<string, unknown>
}

/**
 * Write an audit log entry (fire-and-forget)
 * Uses the create_audit_log() PostgreSQL function via RPC
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
    try {
        const supabase = await createClient()

        const { error } = await supabase.rpc('create_audit_log', {
            p_user_id: input.userId,
            p_event_type: input.eventType,
            p_description: input.description,
            p_severity: input.severity || 'info',
            p_metadata: input.metadata || {},
        })

        if (error) {
            log.warn('Failed to write audit log', {
                error: error.message,
                eventType: input.eventType,
                userId: input.userId,
            })
        }
    } catch (err) {
        // Never let audit logging break the app
        log.warn('Exception in writeAuditLog', { error: String(err) })
    }
}

// ============================================
// Convenience functions for common events
// ============================================

export const audit = {
    auth: {
        login(userId: string, provider: string, ip?: string) {
            return writeAuditLog({
                userId,
                eventType: 'auth.login',
                description: `User logged in via ${provider}`,
                metadata: { provider, ip },
            })
        },
        logout(userId: string) {
            return writeAuditLog({
                userId,
                eventType: 'auth.logout',
                description: 'User logged out',
            })
        },
    },

    job: {
        created(userId: string, jobId: string, toolName: string, filename: string) {
            return writeAuditLog({
                userId,
                eventType: 'job.created',
                description: `Job created: ${toolName} - ${filename}`,
                metadata: { jobId, toolName, filename },
            })
        },
        completed(userId: string, jobId: string, toolName: string, durationMs: number) {
            return writeAuditLog({
                userId,
                eventType: 'job.completed',
                description: `Job completed: ${toolName} (${durationMs}ms)`,
                metadata: { jobId, toolName, durationMs },
            })
        },
        failed(userId: string, jobId: string, toolName: string, errorMsg: string) {
            return writeAuditLog({
                userId,
                eventType: 'job.failed',
                description: `Job failed: ${toolName} - ${errorMsg}`,
                severity: 'error',
                metadata: { jobId, toolName, error: errorMsg },
            })
        },
    },

    file: {
        uploaded(userId: string, filename: string, sizeBytes: number) {
            return writeAuditLog({
                userId,
                eventType: 'file.uploaded',
                description: `File uploaded: ${filename} (${(sizeBytes / 1024 / 1024).toFixed(2)}MB)`,
                metadata: { filename, sizeBytes },
            })
        },
        deleted(userId: string, filename: string) {
            return writeAuditLog({
                userId,
                eventType: 'file.deleted',
                description: `File deleted: ${filename}`,
                metadata: { filename },
            })
        },
    },

    quota: {
        exceeded(userId: string, used: number, limit: number) {
            return writeAuditLog({
                userId,
                eventType: 'quota.exceeded',
                description: `Quota exceeded: ${used}/${limit}`,
                severity: 'warning',
                metadata: { used, limit },
            })
        },
    },

    security: {
        suspicious(userId: string, description: string, metadata?: Record<string, unknown>) {
            return writeAuditLog({
                userId,
                eventType: 'security.suspicious_activity',
                description,
                severity: 'critical',
                metadata,
            })
        },
    },
}

export default audit
