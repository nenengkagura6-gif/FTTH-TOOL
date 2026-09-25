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
            plan_prices: {
                Row: {
                    plan: string
                    billing_cycle: string
                    /** Harga rupiah penuh (IDR tidak dipakai dengan pecahan sen). */
                    price_idr: number
                    currency: string
                    is_active: boolean
                    updated_at: string
                }
                Insert: {
                    plan: string
                    billing_cycle: string
                    price_idr: number
                    currency?: string
                    is_active?: boolean
                    updated_at?: string
                }
                Update: {
                    plan?: string
                    billing_cycle?: string
                    price_idr?: number
                    currency?: string
                    is_active?: boolean
                    updated_at?: string
                }
                Relationships: []
            }
            payment_confirmations: {
                Row: {
                    id: string
                    user_id: string
                    plan: 'basic' | 'pro' | 'enterprise'
                    billing_cycle: 'monthly' | 'yearly'
                    price_cents: number
                    currency: string
                    sender_name: string
                    sender_bank: string
                    amount_paid: number
                    /** Path storage di bucket 'receipts' (bucket privat). */
                    receipt_url: string
                    status: 'pending' | 'approved' | 'rejected'
                    admin_notes: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    plan: 'basic' | 'pro' | 'enterprise'
                    billing_cycle: 'monthly' | 'yearly'
                    /** Diisi server oleh tr_enforce_payment_price — jangan dikirim client. */
                    price_cents?: number
                    currency?: string
                    sender_name: string
                    sender_bank: string
                    /** Diisi server oleh tr_enforce_payment_price — jangan dikirim client. */
                    amount_paid?: number
                    receipt_url: string
                    /** Dipaksa 'pending' oleh trigger saat INSERT. */
                    status?: 'pending' | 'approved' | 'rejected'
                    admin_notes?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    plan?: 'basic' | 'pro' | 'enterprise'
                    billing_cycle?: 'monthly' | 'yearly'
                    price_cents?: number
                    currency?: string
                    sender_name?: string
                    sender_bank?: string
                    amount_paid?: number
                    receipt_url?: string
                    status?: 'pending' | 'approved' | 'rejected'
                    admin_notes?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            api_keys: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    key_hash: string
                    key_prefix: string
                    is_active: boolean
                    usage_count: number
                    last_used_at: string | null
                    expires_at: string | null
                    permissions: Json | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    key_hash: string
                    key_prefix: string
                    is_active?: boolean
                    usage_count?: number
                    last_used_at?: string | null
                    expires_at?: string | null
                    permissions?: Json | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    key_hash?: string
                    key_prefix?: string
                    is_active?: boolean
                    usage_count?: number
                    last_used_at?: string | null
                    expires_at?: string | null
                    permissions?: Json | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            profiles: {
                Row: {
                    id: string
                    email: string
                    full_name: string | null
                    avatar_url: string | null
                    plan: 'free' | 'basic' | 'pro' | 'enterprise'
                    role: 'user' | 'admin'
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
                    plan?: 'free' | 'basic' | 'pro' | 'enterprise'
                    role?: 'user' | 'admin'
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
                    plan?: 'free' | 'basic' | 'pro' | 'enterprise'
                    role?: 'user' | 'admin'
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
                Relationships: []
            }
            // Notifikasi lahir HANYA dari fungsi SECURITY DEFINER di
            // supabase/2026-09-14-admin-panel-upgrade.sql — role authenticated
            // tidak punya hak INSERT, dan hanya boleh meng-update read_at.
            notifications: {
                Row: {
                    id: string
                    user_id: string
                    kind: string
                    payload: Json
                    read_at: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    kind: string
                    payload?: Json
                    read_at?: string | null
                    created_at?: string
                }
                Update: {
                    read_at?: string | null
                }
                Relationships: []
            }
            device_registrations: {
                Row: {
                    id: string
                    device_hash: string
                    user_id: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    device_hash: string
                    user_id: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    device_hash?: string
                    user_id?: string
                    created_at?: string
                }
                Relationships: []
            }
            processing_jobs: {
                Row: {
                    id: string
                    user_id: string
                    tool_name: string
                    job_type: string
                    original_filename: string
                    original_file_url: string | null
                    original_file_size_bytes: number | null
                    original_file_hash: string | null
                    output_filename: string | null
                    output_file_url: string | null
                    output_file_size_bytes: number | null
                    status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired'
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
                    tool_name: string
                    job_type?: string
                    original_filename: string
                    original_file_url?: string | null
                    original_file_size_bytes?: number | null
                    original_file_hash?: string | null
                    output_filename?: string | null
                    output_file_url?: string | null
                    output_file_size_bytes?: number | null
                    status?: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired'
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
                    tool_name?: string
                    job_type?: string
                    original_filename?: string
                    original_file_url?: string | null
                    original_file_size_bytes?: number | null
                    original_file_hash?: string | null
                    output_filename?: string | null
                    output_file_url?: string | null
                    output_file_size_bytes?: number | null
                    status?: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired'
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
                Relationships: []
            }
            subscriptions: {
                Row: {
                    id: string
                    user_id: string
                    plan: 'free' | 'basic' | 'pro' | 'enterprise'
                    status: 'active' | 'paused' | 'cancelled' | 'past_due' | 'trialing' | 'expired'
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
                    plan: 'free' | 'basic' | 'pro' | 'enterprise'
                    status?: 'active' | 'paused' | 'cancelled' | 'past_due' | 'trialing' | 'expired'
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
                    plan?: 'free' | 'basic' | 'pro' | 'enterprise'
                    status?: 'active' | 'paused' | 'cancelled' | 'past_due' | 'trialing' | 'expired'
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
                Relationships: []
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
                Relationships: []
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
                Relationships: []
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
                Relationships: []
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
                Relationships: []
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
                Relationships: []
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
            check_device_registration: {
                Args: {
                    p_device_hash: string
                    p_user_id: string
                }
                Returns: Json
            }
            reset_user_devices: {
                Args: {
                    p_user_id: string
                }
                Returns: Json
            }
            refresh_subscription_status: {
                Args: Record<string, never>
                Returns: undefined
            }
            is_admin: {
                Args: Record<string, never>
                Returns: boolean
            }
            has_quota_remaining: {
                Args: { p_user_id: string }
                Returns: boolean
            }
            get_admin_payments: {
                Args: Record<string, never>
                Returns: {
                    id: string
                    user_id: string
                    plan: string
                    billing_cycle: string
                    price_cents: number
                    currency: string
                    sender_name: string
                    sender_bank: string
                    amount_paid: number
                    receipt_url: string
                    status: string
                    admin_notes: string | null
                    created_at: string
                    updated_at: string
                    email: string
                    full_name: string | null
                }[]
            }
            approve_payment: {
                Args: { p_payment_id: string }
                Returns: Json
            }
            admin_set_user_plan: {
                Args: {
                    p_user_id: string
                    p_plan: string
                    p_days?: number
                }
                Returns: Json
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
            // ── Panel admin (supabase/2026-09-14-admin-panel-upgrade.sql) ──
            get_admin_stats: {
                Args: Record<string, never>
                Returns: Json
            }
            get_admin_users: {
                Args: {
                    p_search?: string | null
                    p_limit?: number
                    p_offset?: number
                    p_filter?: string
                }
                Returns: {
                    id: string
                    email: string
                    full_name: string | null
                    plan: 'free' | 'basic' | 'pro' | 'enterprise'
                    role: 'user' | 'admin'
                    quota_used: number
                    quota_limit: number
                    is_active: boolean
                    created_at: string
                    last_login_at: string | null
                    sub_status: string | null
                    sub_billing_cycle: string | null
                    sub_started_at: string | null
                    sub_expires_at: string | null
                    days_remaining: number | null
                    device_count: number
                    total_count: number
                }[]
            }
            get_admin_user_detail: {
                Args: {
                    p_user_id: string
                    p_limit?: number
                }
                Returns: Json
            }
            get_admin_audit_logs: {
                Args: {
                    p_search?: string | null
                    p_limit?: number
                    p_offset?: number
                }
                Returns: {
                    id: string
                    event_type: string
                    description: string | null
                    severity: 'info' | 'warning' | 'error' | 'critical'
                    metadata: Json
                    created_at: string
                    actor_id: string | null
                    actor_email: string | null
                    target_id: string | null
                    target_email: string | null
                    total_count: number
                }[]
            }
            admin_reset_devices: {
                Args: { p_user_id: string }
                Returns: Json
            }
            admin_reject_payment: {
                Args: {
                    p_payment_id: string
                    p_notes?: string | null
                }
                Returns: Json
            }
            // Step-up: kesegaran autentikasi dibaca dari klaim `amr` JWT,
            // jadi tidak bisa dikarang dari sisi browser.
            my_auth_age: {
                Args: Record<string, never>
                Returns: Json
            }
            auth_age_seconds: {
                Args: Record<string, never>
                Returns: number | null
            }
            require_fresh_auth: {
                Args: { p_max_age?: number }
                Returns: undefined
            }
            has_mfa_enrolled: {
                Args: Record<string, never>
                Returns: boolean
            }
            my_security_status: {
                Args: Record<string, never>
                Returns: Json
            }
            admin_log_step_up_failure: {
                Args: { p_alasan?: string | null }
                Returns: Json
            }
            admin_log_mfa_change: {
                Args: { p_terdaftar: boolean }
                Returns: Json
            }
            admin_extend_subscription: {
                Args: {
                    p_user_id: string
                    p_days?: number
                }
                Returns: Json
            }
            admin_revoke_subscription: {
                Args: { p_user_id: string }
                Returns: Json
            }
            admin_set_user_role: {
                Args: {
                    p_user_id: string
                    p_role: string
                }
                Returns: Json
            }
            admin_set_user_active: {
                Args: {
                    p_user_id: string
                    p_active: boolean
                }
                Returns: Json
            }
            admin_reset_quota: {
                Args: { p_user_id: string }
                Returns: Json
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
