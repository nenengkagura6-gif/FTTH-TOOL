// ==================================================
// Profile Service - User Profile Management
// ==================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'

type Profile = Database['public']['Tables']['profiles']['Row']
type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export interface UpdateProfileInput {
    full_name?: string
    avatar_url?: string
    timezone?: string
    language?: string
}

export class ProfileService {
    private supabase
    private userId

    constructor(userId: string) {
        this.userId = userId
    }

    static async create(userId: string): Promise<ProfileService> {
        const service = new ProfileService(userId)
        service.supabase = await createClient()
        return service
    }

    // Get current user profile
    async getProfile(): Promise<{ profile: Profile | null; error: Error | null }> {
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('*')
                .eq('id', this.userId)
                .single()

            if (error) throw error

            return { profile: data, error: null }
        } catch (error) {
            console.error('Error fetching profile:', error)
            return { profile: null, error: error as Error }
        }
    }

    // Update profile
    async updateProfile(input: UpdateProfileInput): Promise<{ profile: Profile | null; error: Error | null }> {
        try {
            const updates: ProfileUpdate = {
                ...input,
                updated_at: new Date().toISOString(),
            }

            const { data, error } = await this.supabase
                .from('profiles')
                .update(updates)
                .eq('id', this.userId)
                .select()
                .single()

            if (error) throw error

            return { profile: data, error: null }
        } catch (error) {
            console.error('Error updating profile:', error)
            return { profile: null, error: error as Error }
        }
    }

    // Get quota status
    async getQuotaStatus(): Promise<{
        limit: number
        used: number
        remaining: number
        percentUsed: number
        resetsAt: string | null
        error: Error | null
    }> {
        try {
            const { profile, error } = await this.getProfile()

            if (error || !profile) {
                return { limit: 0, used: 0, remaining: 0, percentUsed: 0, resetsAt: null, error }
            }

            const remaining = Math.max(0, profile.quota_limit - profile.quota_used)
            const percentUsed = Math.round((profile.quota_used / profile.quota_limit) * 100)

            return {
                limit: profile.quota_limit,
                used: profile.quota_used,
                remaining,
                percentUsed,
                resetsAt: profile.quota_reset_at,
                error: null,
            }
        } catch (error) {
            console.error('Error getting quota status:', error)
            return { limit: 0, used: 0, remaining: 0, percentUsed: 0, resetsAt: null, error: error as Error }
        }
    }

    // Check if user can process (has quota)
    async canProcess(): Promise<{ allowed: boolean; reason?: string; error: Error | null }> {
        try {
            const { data, error } = await this.supabase
                .rpc('check_user_quota', { p_user_id: this.userId })

            if (error) throw error

            return {
                allowed: data,
                reason: data ? undefined : 'Quota exceeded',
                error: null,
            }
        } catch (error) {
            console.error('Error checking quota:', error)
            return { allowed: false, reason: 'Error checking quota', error: error as Error }
        }
    }

    // Get subscription info
    async getSubscription() {
        try {
            const { data, error } = await this.supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', this.userId)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows

            return { subscription: data, error: null }
        } catch (error) {
            console.error('Error fetching subscription:', error)
            return { subscription: null, error: error as Error }
        }
    }
}

// Admin profile service
export class AdminProfileService {
    private supabase

    constructor() {
        this.supabase = createServiceClient()
    }

    // Get user by ID (admin only)
    async getUserProfile(userId: string): Promise<{ profile: Profile | null; error: Error | null }> {
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('*, subscriptions(*)')
                .eq('id', userId)
                .single()

            if (error) throw error

            return { profile: data, error: null }
        } catch (error) {
            console.error('Error fetching user profile:', error)
            return { profile: null, error: error as Error }
        }
    }

    // Update user plan (admin only)
    async updateUserPlan(userId: string, plan: Profile['plan'], quotaLimit: number): Promise<{ success: boolean; error: Error | null }> {
        try {
            const { error } = await this.supabase
                .from('profiles')
                .update({
                    plan,
                    quota_limit: quotaLimit,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', userId)

            if (error) throw error

            return { success: true, error: null }
        } catch (error) {
            console.error('Error updating user plan:', error)
            return { success: false, error: error as Error }
        }
    }

    // List all users with pagination (admin only)
    async listUsers(options: { page?: number; limit?: number; search?: string } = {}) {
        try {
            const page = options.page || 1
            const limit = options.limit || 20
            const offset = (page - 1) * limit

            let query = this.supabase
                .from('profiles')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })

            if (options.search) {
                query = query.or(`email.ilike.%${options.search}%,full_name.ilike.%${options.search}%`)
            }

            const { data, error, count } = await query.range(offset, offset + limit - 1)

            if (error) throw error

            return {
                users: data || [],
                total: count || 0,
                page,
                totalPages: Math.ceil((count || 0) / limit),
                error: null,
            }
        } catch (error) {
            console.error('Error listing users:', error)
            return { users: [], total: 0, page: 1, totalPages: 0, error: error as Error }
        }
    }

    // Get system stats (admin only)
    async getSystemStats() {
        try {
            // Total users
            const { count: totalUsers, error: usersError } = await this.supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })

            if (usersError) throw usersError

            // Jobs by status
            const { data: jobStats, error: jobsError } = await this.supabase
                .from('processing_jobs')
                .select('status')

            if (jobsError) throw jobsError

            const jobsByStatus = jobStats?.reduce((acc, job) => {
                acc[job.status] = (acc[job.status] || 0) + 1
                return acc
            }, {} as Record<string, number>)

            // Users by plan
            const { data: planStats, error: planError } = await this.supabase
                .from('profiles')
                .select('plan')

            if (planError) throw planError

            const usersByPlan = planStats?.reduce((acc, user) => {
                acc[user.plan] = (acc[user.plan] || 0) + 1
                return acc
            }, {} as Record<string, number>)

            return {
                totalUsers: totalUsers || 0,
                totalJobs: jobStats?.length || 0,
                jobsByStatus: jobsByStatus || {},
                usersByPlan: usersByPlan || {},
                error: null,
            }
        } catch (error) {
            console.error('Error getting system stats:', error)
            return { totalUsers: 0, totalJobs: 0, jobsByStatus: {}, usersByPlan: {}, error: error as Error }
        }
    }
}
