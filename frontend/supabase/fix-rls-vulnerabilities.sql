-- =========================================================================
-- MIGRATION: FIX ROW LEVEL SECURITY (RLS) & SECURE VIEWS
-- Run this script in the Supabase SQL Editor (https://supabase.com)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. SECURE SYSTEM_CONFIG TABLE
-- -------------------------------------------------------------------------

-- Enable Row Level Security (RLS) on system_config
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config FORCE ROW LEVEL SECURITY;

-- Clean up existing policies if any
DROP POLICY IF EXISTS "Allow public read access to system_config" ON public.system_config;
DROP POLICY IF EXISTS "Service role can manage system_config" ON public.system_config;

-- Policy: Allow read-only (SELECT) access to public & authenticated users
CREATE POLICY "Allow public read access to system_config"
    ON public.system_config FOR SELECT
    USING (true);

-- Policy: Allow write/all (INSERT, UPDATE, DELETE) access strictly to the service_role
CREATE POLICY "Service role can manage system_config"
    ON public.system_config FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -------------------------------------------------------------------------
-- 2. SECURE DATABASE VIEWS WITH SECURITY_INVOKER
-- -------------------------------------------------------------------------

-- Drop existing views
DROP VIEW IF EXISTS public.daily_usage_summary;
DROP VIEW IF EXISTS public.job_success_rate;
DROP VIEW IF EXISTS public.active_subscriptions_summary;

-- Recreate View 1: daily_usage_summary with security_invoker
CREATE OR REPLACE VIEW public.daily_usage_summary 
WITH (security_invoker = on) AS
SELECT 
    DATE(created_at) as date,
    user_id,
    COUNT(*) as total_requests,
    SUM(processing_time_ms) as total_processing_time_ms,
    COUNT(DISTINCT endpoint) as unique_endpoints
FROM public.usage_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), user_id;

-- Recreate View 2: job_success_rate with security_invoker
CREATE OR REPLACE VIEW public.job_success_rate 
WITH (security_invoker = on) AS
SELECT 
    user_id,
    tool_name,
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
    ROUND(
        COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
        NULLIF(COUNT(*), 0)::numeric * 100, 
        2
    ) as success_rate_percent
FROM public.processing_jobs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id, tool_name;

-- Recreate View 3: active_subscriptions_summary with security_invoker
CREATE OR REPLACE VIEW public.active_subscriptions_summary 
WITH (security_invoker = on) AS
SELECT 
    plan,
    status,
    COUNT(*) as count,
    SUM(price_cents) as total_revenue_cents
FROM public.subscriptions
WHERE status = 'active'
GROUP BY plan, status;

-- -------------------------------------------------------------------------
-- Verification Info:
-- Querying views anonymously will now return 0 rows since RLS is respected.
-- Modifying system_config anonymously is now blocked.
-- -------------------------------------------------------------------------
