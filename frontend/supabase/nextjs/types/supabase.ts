// ==================================================
// Supabase Database Types
// Auto-generated and manually maintained
// ==================================================

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    email: string
                    full_name: string | null
                    avatar_url: string | null
                    plan: 'free' | 'pro' | 'enterprise'
                    quota_limit: number
                    quota_used: number
                    quota_reset_at: string | null
                    is_active: boolean
                    email_verified: boolean
                    timezone: string
                    language: string
                    created_at: string
                    updated_at: string
                    last_login_at: string | null
                }
                Insert: {
                    id: string
                    email: string
                    full_name?: string | null
                    avatar_url?: string | null
                    plan?: 'free' | 'pro' | 'enterprise'
                    quota_limit?: number
                    quota_used?: number
                    quota_reset_at?: string | null
                    is_active?: boolean
                    email_verified?: boolean
                    timezone?: string
                    language?: string
                    created_at?: string
                    updated_at?: string
                    last_login_at?: string | null
                }
                Update: {
                    id?: string
                    email?: string
                    full_name?: string | null
                    avatar_url?: string | null
                    plan?: 'free' | 'pro' | 'enterprise'
                    quota_limit?: number
                    quota_used?: number
                    quota_reset_at?: string | null
                    is_active?: boolean
                    email_verified?: boolean
                    timezone?: string
                    language?: string
                    created_at?: string
                    updated_at?: string
                    last_login_at?: string | null
                }
            }
            processing_jobs: {
                Row: {
                    id: string
                    user_id: string
                    tool_name: 'kml_to_boq' | 'kml_to_database' | 'kml_duplicate_checker' | 'otdr_analyzer' | 'opm_calculator'
                    job_type: string
                    original_filename: string
                    original_file_url: string | null
                    original_file_size_bytes: number | null
                    original_file_hash: string | null
                    output_filename: string | null
                    output_file_url: string | null
                    output_file_size_bytes: number | null
                    status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
                    processing_time_ms: number | null
                    queue_time_ms: number | null
                    retry_count: number
                    max_retries: number
                    error_message: string | null
                    error_code: string | null
                    error_details: Json | null
                    config: Json
                    progress_percent: number | null
                    progress_message: string | null
                    created_at: string
                    updated_at: string
                    started_at: string | null
                    completed_at: string | null
                    expires_at: string | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    tool_name: 'kml_to_boq' | 'kml_to_database' | 'kml_duplicate_checker' | 'otdr_analyzer' | 'opm_calculator'
                    job_type?: string
                    original_filename: string
                    original_file_url?: string | null
                    original_file_size_bytes?: number | null
                    original_file_hash?: string | null
                    output_filename?: string | null
                    output_file_url?: string | null
                    output_file_size_bytes?: number | null
                    status?: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
                    processing_time_ms?: number | null
                    queue_time_ms?: number | null
                    retry_count?: number
                    max_retries?: number
                    error_message?: string | null
                    error_code?: string | null
                    error_details?: Json | null
                    config?: Json
                    progress_percent?: number | null
                    progress_message?: string | null
                    created_at?: string
                    updated_at?: string
                    started_at?: string | null
                    completed_at?: string | null
                    expires_at?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    tool_name?: 'kml_to_boq' | 'kml_to_database' | 'kml_duplicate_checker' | 'otdr_analyzer' | 'opm_calculator'
                    job_type?: string
                    original_filename?: string
                    original_file_url?: string | null
                    original_file_size_bytes?: number | null
                    original_file_hash?: string | null
                    output_filename?: string | null
                    output_file_url?: string | null
                    output_file_size_bytes?: number | null
                    status?: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
                    processing_time_ms?: number | null
                    queue_time_ms?: number | null
                    retry_count?: number
                    max_retries?: number
                    error_message?: string | null
                    error_code?: string | null
                    error_details?: Json | null
                    config?: Json
                    progress_percent?: number | null
                    progress_message?: string | null
                    created_at?: string
                    updated_at?: string
                    started_at?: string | null
                    completed_at?: string | null
                    expires_at?: string | null
                }
            }
            subscriptions: {
                Row: {
                    id: string
                    user_id: string
                    plan: 'free' | 'pro' | 'enterprise'
                    status: 'active' | 'paused' | 'cancelled' | 'past_due' | 'trialing'
                    billing_cycle: 'monthly' | 'yearly' | null
                    price_cents: number | null
                    currency: string
                    started_at: string
                    expires_at: string | null
                    trial_ends_at: string | null
                    cancelled_at: string | null
                    payment_provider: 'stripe' | 'midtrans' | 'manual' | null
                    provider_subscription_id: string | null
                    provider_customer_id: string | null
                    metadata: Json
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    plan: 'free' | 'pro' | 'enterprise'
                    status?: 'active' | 'paused' | 'cancelled' | 'past_due' | 'trialing'
                    billing_cycle?: 'monthly' | 'yearly' | null
                    price_cents?: number | null
                    currency?: string
                    started_at?: string
                    expires_at?: string | null
                    trial_ends_at?: string | null
                    cancelled_at?: string | null
                    payment_provider?: 'stripe' | 'midtrans' | 'manual' | null
                    provider_subscription_id?: string | null
                    provider_customer_id?: string | null
                    metadata?: Json
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    plan?: 'free' | 'pro' | 'enterprise'
                    status?: 'active' | 'paused' | 'cancelled' | 'past_due' | 'trialing'
                    billing_cycle?: 'monthly' | 'yearly' | null
                    price_cents?: number | null
                    currency?: string
                    started_at?: string
                    expires_at?: string | null
                    trial_ends_at?: string | null
                    cancelled_at?: string | null
                    payment_provider?: 'stripe' | 'midtrans' | 'manual' | null
                    provider_subscription_id?: string | null
                    provider_customer_id?: string | null
                    metadata?: Json
                    created_at?: string
                    updated_at?: string
                }
            }
            usage_logs: {
                Row: {
                    id: string
                    user_id: string
                    endpoint: string
                    method: string
                    request_count: number
                    processing_time_ms: number | null
                    response_size_bytes: number | null
                    tool_name: string | null
                    job_id: string | null
                    user_agent: string | null
                    ip_address: string | null
                    country_code: string | null
                    status_code: number | null
                    error_occurred: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    endpoint: string
                    method: string
                    request_count?: number
                    processing_time_ms?: number | null
                    response_size_bytes?: number | null
                    tool_name?: string | null
                    job_id?: string | null
                    user_agent?: string | null
                    ip_address?: string | null
                    country_code?: string | null
                    status_code?: number | null
                    error_occurred?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    endpoint?: string
                    method?: string
                    request_count?: number
                    processing_time_ms?: number | null
                    response_size_bytes?: number | null
                    tool_name?: string | null
                    job_id?: string | null
                    user_agent?: string | null
                    ip_address?: string | null
                    country_code?: string | null
                    status_code?: number | null
                    error_occurred?: boolean
                    created_at?: string
                }
            }
            audit_logs: {
                Row: {
                    id: string
                    user_id: string | null
                    event_type: string
                    description: string | null
                    metadata: Json
                    ip_address: string | null
                    user_agent: string | null
                    severity: 'info' | 'warning' | 'error' | 'critical'
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id?: string | null
                    event_type: string
                    description?: string | null
                    metadata?: Json
                    ip_address?: string | null
                    user_agent?: string | null
                    severity?: 'info' | 'warning' | 'error' | 'critical'
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string | null
                    event_type?: string
                    description?: string | null
                    metadata?: Json
                    ip_address?: string | null
                    user_agent?: string | null
                    severity?: 'info' | 'warning' | 'error' | 'critical'
                    created_at?: string
                }
            }
            system_config: {
                Row: {
                    key: string
                    value: Json
                    description: string | null
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    key: string
                    value: Json
                    description?: string | null
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    key?: string
                    value?: Json
                    description?: string | null
                    updated_at?: string
                    updated_by?: string | null
                }
            }
        }
        Views: {
            daily_usage_summary: {
                Row: {
                    date: string | null
                    user_id: string | null
                    total_requests: number | null
                    total_processing_time_ms: number | null
                    unique_endpoints: number | null
                }
            }
            job_success_rate: {
                Row: {
                    user_id: string | null
                    tool_name: string | null
                    total_jobs: number | null
                    successful_jobs: number | null
                    failed_jobs: number | null
                    success_rate_percent: number | null
                }
            }
        }
        Functions: {
            check_user_quota: {
                Args: { p_user_id: string }
                Returns: boolean
            }
            increment_quota_usage: {
                Args: { p_user_id: string }
                Returns: undefined
            }
            create_audit_log: {
                Args: {
                    p_user_id: string
                    p_event_type: string
                    p_description: string
                    p_severity: string
                    p_metadata: Json
                }
                Returns: string
            }
        }
        Enums: {
            [_ in never]: never
        }
    }
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = 
    Database['public']['Tables'][T]['Row']

export type InsertTables<T extends keyof Database['public']['Tables']> = 
    Database['public']['Tables'][T]['Insert']

export type UpdateTables<T extends keyof Database['public']['Tables']> = 
    Database['public']['Tables'][T]['Update']

export type Views<T extends keyof Database['public']['Views']> = 
    Database['public']['Views'][T]['Row']
