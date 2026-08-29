// ==================================================
// Job Service - Processing Job Management
// Business logic for job lifecycle
// ==================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'

type Job = Database['public']['Tables']['processing_jobs']['Row']
type JobInsert = Database['public']['Tables']['processing_jobs']['Insert']
type JobUpdate = Database['public']['Tables']['processing_jobs']['Update']

export interface CreateJobInput {
    tool_name: Job['tool_name']
    original_filename: string
    original_file_url?: string
    original_file_size_bytes?: number
    original_file_hash?: string
    config?: Record<string, unknown>
}

export interface JobListFilters {
    status?: Job['status']
    tool_name?: Job['tool_name']
    limit?: number
    offset?: number
}

// Service for user operations (respects RLS)
export class JobService {
    private supabase
    private userId

    constructor(userId: string) {
        this.userId = userId
        // Note: createClient() is async, so we'll need to handle this differently
        // For now, this is a structural example
    }

    static async create(userId: string): Promise<JobService> {
        const service = new JobService(userId)
        service.supabase = await createClient()
        return service
    }

    // Create a new job
    async createJob(input: CreateJobInput): Promise<{ job: Job | null; error: Error | null }> {
        try {
            const jobData: JobInsert = {
                user_id: this.userId,
                tool_name: input.tool_name,
                original_filename: input.original_filename,
                original_file_url: input.original_file_url,
                original_file_size_bytes: input.original_file_size_bytes,
                original_file_hash: input.original_file_hash,
                config: input.config || {},
                status: 'pending',
                retry_count: 0,
                max_retries: 3,
                progress_percent: 0,
            }

            const { data, error } = await this.supabase
                .from('processing_jobs')
                .insert(jobData)
                .select()
                .single()

            if (error) throw error

            return { job: data, error: null }
        } catch (error) {
            console.error('Error creating job:', error)
            return { job: null, error: error as Error }
        }
    }

    // Get job by ID
    async getJob(jobId: string): Promise<{ job: Job | null; error: Error | null }> {
        try {
            const { data, error } = await this.supabase
                .from('processing_jobs')
                .select('*')
                .eq('id', jobId)
                .eq('user_id', this.userId) // Extra safety
                .single()

            if (error) throw error

            return { job: data, error: null }
        } catch (error) {
            console.error('Error fetching job:', error)
            return { job: null, error: error as Error }
        }
    }

    // List jobs with filtering
    async listJobs(filters: JobListFilters = {}): Promise<{ jobs: Job[]; count: number; error: Error | null }> {
        try {
            let query = this.supabase
                .from('processing_jobs')
                .select('*', { count: 'exact' })
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })

            if (filters.status) {
                query = query.eq('status', filters.status)
            }

            if (filters.tool_name) {
                query = query.eq('tool_name', filters.tool_name)
            }

            if (filters.limit) {
                query = query.limit(filters.limit)
            }

            if (filters.offset) {
                query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1)
            }

            const { data, error, count } = await query

            if (error) throw error

            return { jobs: data || [], count: count || 0, error: null }
        } catch (error) {
            console.error('Error listing jobs:', error)
            return { jobs: [], count: 0, error: error as Error }
        }
    }

    // Get recent jobs
    async getRecentJobs(limit: number = 10): Promise<{ jobs: Job[]; error: Error | null }> {
        return this.listJobs({ limit })
    }

    // Cancel a pending job
    async cancelJob(jobId: string): Promise<{ success: boolean; error: Error | null }> {
        try {
            const { error } = await this.supabase
                .from('processing_jobs')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', jobId)
                .eq('user_id', this.userId)
                .eq('status', 'pending') // Only cancel pending jobs

            if (error) throw error

            return { success: true, error: null }
        } catch (error) {
            console.error('Error cancelling job:', error)
            return { success: false, error: error as Error }
        }
    }

    // Delete a job and its files
    async deleteJob(jobId: string): Promise<{ success: boolean; error: Error | null }> {
        try {
            // First get job to find file URLs
            const { job } = await this.getJob(jobId)
            
            if (!job) {
                return { success: false, error: new Error('Job not found') }
            }

            // Delete from database
            const { error } = await this.supabase
                .from('processing_jobs')
                .delete()
                .eq('id', jobId)
                .eq('user_id', this.userId)

            if (error) throw error

            // TODO: Delete files from storage
            // This should be done via a server-side function that has storage access

            return { success: true, error: null }
        } catch (error) {
            console.error('Error deleting job:', error)
            return { success: false, error: error as Error }
        }
    }

    // Get job statistics
    async getJobStats(): Promise<{
        total: number
        completed: number
        failed: number
        pending: number
        processing: number
        error: Error | null
    }> {
        try {
            const { data, error } = await this.supabase
                .from('processing_jobs')
                .select('status')
                .eq('user_id', this.userId)

            if (error) throw error

            const stats = {
                total: data?.length || 0,
                completed: data?.filter(j => j.status === 'completed').length || 0,
                failed: data?.filter(j => j.status === 'failed').length || 0,
                pending: data?.filter(j => j.status === 'pending').length || 0,
                processing: data?.filter(j => j.status === 'processing').length || 0,
                error: null,
            }

            return stats
        } catch (error) {
            console.error('Error getting job stats:', error)
            return { total: 0, completed: 0, failed: 0, pending: 0, processing: 0, error: error as Error }
        }
    }
}

// Admin/Worker service (uses service role, bypasses RLS)
export class JobWorkerService {
    private supabase

    constructor() {
        this.supabase = createServiceClient()
    }

    // Get pending jobs for processing
    async getPendingJobs(limit: number = 10): Promise<{ jobs: Job[]; error: Error | null }> {
        try {
            const { data, error } = await this.supabase
                .from('processing_jobs')
                .select('*, profiles!inner(quota_limit, quota_used)')
                .eq('status', 'pending')
                .order('created_at', { ascending: true })
                .limit(limit)

            if (error) throw error

            return { jobs: data || [], error: null }
        } catch (error) {
            console.error('Error fetching pending jobs:', error)
            return { jobs: [], error: error as Error }
        }
    }

    // Update job status (for workers)
    async updateJobStatus(
        jobId: string,
        status: Job['status'],
        updates: Partial<Job> = {}
    ): Promise<{ success: boolean; error: Error | null }> {
        try {
            const updateData: JobUpdate = {
                status,
                ...updates,
                updated_at: new Date().toISOString(),
            }

            if (status === 'processing' && !updates.started_at) {
                updateData.started_at = new Date().toISOString()
            }

            if ((status === 'completed' || status === 'failed') && !updates.completed_at) {
                updateData.completed_at = new Date().toISOString()
            }

            const { error } = await this.supabase
                .from('processing_jobs')
                .update(updateData)
                .eq('id', jobId)

            if (error) throw error

            return { success: true, error: null }
        } catch (error) {
            console.error('Error updating job status:', error)
            return { success: false, error: error as Error }
        }
    }

    // Increment progress
    async updateProgress(
        jobId: string,
        progress: number,
        message?: string
    ): Promise<{ success: boolean; error: Error | null }> {
        try {
            const { error } = await this.supabase
                .from('processing_jobs')
                .update({
                    progress_percent: Math.min(100, Math.max(0, progress)),
                    progress_message: message,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', jobId)

            if (error) throw error

            return { success: true, error: null }
        } catch (error) {
            console.error('Error updating progress:', error)
            return { success: false, error: error as Error }
        }
    }

    // Clean up expired jobs
    async cleanupExpiredJobs(): Promise<{ deleted: number; error: Error | null }> {
        try {
            const { data, error } = await this.supabase
                .from('processing_jobs')
                .delete()
                .lt('expires_at', new Date().toISOString())
                .select('id')

            if (error) throw error

            return { deleted: data?.length || 0, error: null }
        } catch (error) {
            console.error('Error cleaning up expired jobs:', error)
            return { deleted: 0, error: error as Error }
        }
    }
}
