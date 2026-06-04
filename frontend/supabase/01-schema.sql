-- ==================================================
-- FTTH TOOL - PRODUCTION SaaS DATABASE SCHEMA
-- Multi-tenant SaaS with Row Level Security
-- ==================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==================================================
-- PROFILES TABLE
-- User profiles linked to auth.users
-- ==================================================

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    
    -- Subscription & Quota
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    quota_limit INTEGER NOT NULL DEFAULT 100, -- monthly processing limit
    quota_used INTEGER NOT NULL DEFAULT 0,
    quota_reset_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    timezone TEXT DEFAULT 'UTC',
    language TEXT DEFAULT 'en',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_plan ON profiles(plan);
CREATE INDEX idx_profiles_quota_reset ON profiles(quota_reset_at);

-- ==================================================
-- SUBSCRIPTIONS TABLE
-- Future-ready subscription management
-- ==================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Plan Details
    plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'past_due', 'trialing')),
    
    -- Billing
    billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
    price_cents INTEGER,
    currency TEXT DEFAULT 'USD',
    
    -- Period
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    
    -- Payment Provider
    payment_provider TEXT CHECK (payment_provider IN ('stripe', 'midtrans', 'manual')),
    provider_subscription_id TEXT,
    provider_customer_id TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_provider_id ON subscriptions(provider_subscription_id);
CREATE INDEX idx_subscriptions_expires ON subscriptions(expires_at);

-- ==================================================
-- PROCESSING_JOBS TABLE
-- Central job tracking for all tools
-- ==================================================

CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    tool_name TEXT NOT NULL CHECK (tool_name IN (
        'kml_to_boq',
        'kml_to_database',
        'kml_duplicate_checker',
        'otdr_analyzer',
        'opm_calculator',
        'kml_to_csv',
        'kml_to_shp',
        'shp_to_kml'
    )),
    job_type TEXT NOT NULL DEFAULT 'single',
    
    -- Input
    original_filename TEXT NOT NULL,
    original_file_url TEXT,
    original_file_size_bytes BIGINT,
    original_file_hash TEXT, -- for deduplication
    
    -- Output
    output_filename TEXT,
    output_file_url TEXT,
    output_file_size_bytes BIGINT,
    
    -- Processing Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'queued',
        'processing',
        'completed',
        'failed',
        'cancelled'
    )),
    
    -- Processing Metrics
    processing_time_ms INTEGER,
    queue_time_ms INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    
    -- Error Handling
    error_message TEXT,
    error_code TEXT,
    error_details JSONB,
    
    -- Job Configuration
    config JSONB DEFAULT '{}', -- tool-specific configuration
    
    -- Progress Tracking (for long-running jobs)
    progress_percent INTEGER CHECK (progress_percent BETWEEN 0 AND 100),
    progress_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days') -- auto-cleanup
);

CREATE INDEX idx_processing_jobs_user_id ON processing_jobs(user_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_tool ON processing_jobs(tool_name);
CREATE INDEX idx_processing_jobs_created ON processing_jobs(created_at DESC);
CREATE INDEX idx_processing_jobs_expires ON processing_jobs(expires_at);
CREATE INDEX idx_processing_jobs_user_status ON processing_jobs(user_id, status);

-- ==================================================
-- USAGE_LOGS TABLE
-- Detailed usage tracking for analytics & quotas
-- ==================================================

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Request Details
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    
    -- Processing Metrics
    request_count INTEGER NOT NULL DEFAULT 1,
    processing_time_ms INTEGER,
    response_size_bytes INTEGER,
    
    -- Tool-specific
    tool_name TEXT,
    job_id UUID REFERENCES processing_jobs(id) ON DELETE SET NULL,
    
    -- Context
    user_agent TEXT,
    ip_address INET,
    country_code TEXT,
    
    -- Status
    status_code INTEGER,
    error_occurred BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions for scalability
CREATE TABLE usage_logs_2024_01 PARTITION OF usage_logs
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE usage_logs_2024_02 PARTITION OF usage_logs
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
-- ... add more partitions as needed

CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_endpoint ON usage_logs(endpoint);
CREATE INDEX idx_usage_logs_created ON usage_logs(created_at DESC);
CREATE INDEX idx_usage_logs_job ON usage_logs(job_id);

-- ==================================================
-- API_KEYS TABLE
-- Future API monetization
-- ==================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Key Details (hashed storage)
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL, -- first 8 chars for display
    
    -- Permissions
    name TEXT,
    permissions JSONB DEFAULT '["read"]',
    allowed_ips INET[],
    
    -- Rate Limiting
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    
    -- Usage
    last_used_at TIMESTAMPTZ,
    usage_count INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_ip INET
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- ==================================================
-- AUDIT_LOGS TABLE
-- Security & compliance tracking
-- ==================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Event Details
    event_type TEXT NOT NULL CHECK (event_type IN (
        'auth.login',
        'auth.logout',
        'auth.signup',
        'auth.password_reset',
        'auth.email_verified',
        'job.created',
        'job.completed',
        'job.failed',
        'file.uploaded',
        'file.downloaded',
        'file.deleted',
        'quota.exceeded',
        'subscription.changed',
        'api_key.created',
        'api_key.revoked',
        'security.suspicious_activity'
    )),
    
    -- Context
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Request Context
    ip_address INET,
    user_agent TEXT,
    
    -- Severity
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);

-- ==================================================
-- SYSTEM_CONFIG TABLE
-- Feature flags & system settings
-- ==================================================

CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
);

-- Default configs
INSERT INTO system_config (key, value, description) VALUES
    ('maintenance_mode', 'false', 'Global maintenance mode'),
    ('max_file_size_mb', '50', 'Maximum upload file size in MB'),
    ('allowed_file_types', '["kml","kmz","xlsx","csv"]', 'Allowed file extensions'),
    ('default_quota_free', '50', 'Default monthly quota for free users'),
    ('default_quota_pro', '500', 'Default monthly quota for pro users'),
    ('job_retention_days', '30', 'Days to keep completed job records')
ON CONFLICT (key) DO NOTHING;

-- ==================================================
-- FUNCTIONS & TRIGGERS
-- ==================================================

-- Update timestamps automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_jobs_updated_at
    BEFORE UPDATE ON processing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update quota_reset_at monthly
CREATE OR REPLACE FUNCTION reset_monthly_quotas()
RETURNS void AS $$
BEGIN
    UPDATE profiles 
    SET quota_used = 0, 
        quota_reset_at = NOW(),
        updated_at = NOW()
    WHERE quota_reset_at < NOW() - INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql;

-- Create audit log entry
CREATE OR REPLACE FUNCTION create_audit_log(
    p_user_id UUID,
    p_event_type TEXT,
    p_description TEXT,
    p_severity TEXT DEFAULT 'info',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO audit_logs (user_id, event_type, description, severity, metadata)
    VALUES (p_user_id, p_event_type, p_description, p_severity, p_metadata)
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ==================================================
-- VIEWS FOR ANALYTICS
-- ==================================================

-- Daily usage summary
CREATE OR REPLACE VIEW daily_usage_summary 
WITH (security_invoker = on) AS
SELECT 
    DATE(created_at) as date,
    user_id,
    COUNT(*) as total_requests,
    SUM(processing_time_ms) as total_processing_time_ms,
    COUNT(DISTINCT endpoint) as unique_endpoints
FROM usage_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), user_id;

-- Job success rate
CREATE OR REPLACE VIEW job_success_rate 
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
FROM processing_jobs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id, tool_name;

-- Active subscriptions summary
CREATE OR REPLACE VIEW active_subscriptions_summary 
WITH (security_invoker = on) AS
SELECT 
    plan,
    status,
    COUNT(*) as count,
    SUM(price_cents) as total_revenue_cents
FROM subscriptions
WHERE status = 'active'
GROUP BY plan, status;

