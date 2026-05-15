-- ==================================================
-- FTTH TOOL - COMPLETE SETUP (Schema + RLS + Triggers)
-- Copy ALL of this and paste into Supabase SQL Editor
-- ==================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==================================================
-- 1. PROFILES TABLE
-- ==================================================

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    quota_limit INTEGER NOT NULL DEFAULT 100,
    quota_used INTEGER NOT NULL DEFAULT 0,
    quota_reset_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    timezone TEXT DEFAULT 'UTC',
    language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON profiles(plan);
CREATE INDEX IF NOT EXISTS idx_profiles_quota_reset ON profiles(quota_reset_at);

-- ==================================================
-- 2. SUBSCRIPTIONS TABLE
-- ==================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'past_due', 'trialing')),
    billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
    price_cents INTEGER,
    currency TEXT DEFAULT 'USD',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    payment_provider TEXT CHECK (payment_provider IN ('stripe', 'midtrans', 'manual')),
    provider_subscription_id TEXT,
    provider_customer_id TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_id ON subscriptions(provider_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);

-- ==================================================
-- 3. PROCESSING_JOBS TABLE
-- ==================================================

CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL CHECK (tool_name IN (
        'kml_to_boq', 'kml_to_database', 'kml_duplicate_checker',
        'otdr_analyzer', 'opm_calculator'
    )),
    job_type TEXT NOT NULL DEFAULT 'single',
    original_filename TEXT NOT NULL,
    original_file_url TEXT,
    original_file_size_bytes BIGINT,
    original_file_hash TEXT,
    output_filename TEXT,
    output_file_url TEXT,
    output_file_size_bytes BIGINT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'queued', 'processing', 'completed', 'failed', 'cancelled'
    )),
    processing_time_ms INTEGER,
    queue_time_ms INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    error_code TEXT,
    error_details JSONB,
    config JSONB DEFAULT '{}',
    progress_percent INTEGER CHECK (progress_percent BETWEEN 0 AND 100),
    progress_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_tool ON processing_jobs(tool_name);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created ON processing_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_expires ON processing_jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_status ON processing_jobs(user_id, status);

-- ==================================================
-- 4. USAGE_LOGS TABLE (without partition for simplicity)
-- ==================================================

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    request_count INTEGER NOT NULL DEFAULT 1,
    processing_time_ms INTEGER,
    response_size_bytes INTEGER,
    tool_name TEXT,
    job_id UUID REFERENCES processing_jobs(id) ON DELETE SET NULL,
    user_agent TEXT,
    ip_address INET,
    country_code TEXT,
    status_code INTEGER,
    error_occurred BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_endpoint ON usage_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_job ON usage_logs(job_id);

-- ==================================================
-- 5. API_KEYS TABLE
-- ==================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    name TEXT,
    permissions JSONB DEFAULT '["read"]',
    allowed_ips INET[],
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_ip INET
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- ==================================================
-- 6. AUDIT_LOGS TABLE
-- ==================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'auth.login', 'auth.logout', 'auth.signup', 'auth.password_reset', 'auth.email_verified',
        'job.created', 'job.completed', 'job.failed',
        'file.uploaded', 'file.downloaded', 'file.deleted',
        'quota.exceeded', 'subscription.changed',
        'api_key.created', 'api_key.revoked',
        'security.suspicious_activity'
    )),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);

-- ==================================================
-- 7. SYSTEM_CONFIG TABLE
-- ==================================================

CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
);

INSERT INTO system_config (key, value, description) VALUES
    ('maintenance_mode', 'false', 'Global maintenance mode'),
    ('max_file_size_mb', '50', 'Maximum upload file size in MB'),
    ('allowed_file_types', '["kml","kmz","xlsx","csv"]', 'Allowed file extensions'),
    ('default_quota_free', '50', 'Default monthly quota for free users'),
    ('default_quota_pro', '500', 'Default monthly quota for pro users'),
    ('job_retention_days', '30', 'Days to keep completed job records')
ON CONFLICT (key) DO NOTHING;

-- ==================================================
-- 8. FUNCTIONS & TRIGGERS
-- ==================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_processing_jobs_updated_at ON processing_jobs;
CREATE TRIGGER update_processing_jobs_updated_at
    BEFORE UPDATE ON processing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION reset_monthly_quotas()
RETURNS void AS $$
BEGIN
    UPDATE profiles 
    SET quota_used = 0, quota_reset_at = NOW(), updated_at = NOW()
    WHERE quota_reset_at < NOW() - INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_audit_log(
    p_user_id UUID, p_event_type TEXT, p_description TEXT,
    p_severity TEXT DEFAULT 'info', p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE v_log_id UUID;
BEGIN
    INSERT INTO audit_logs (user_id, event_type, description, severity, metadata)
    VALUES (p_user_id, p_event_type, p_description, p_severity, p_metadata)
    RETURNING id INTO v_log_id;
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ==================================================
-- 9. ROW LEVEL SECURITY
-- ==================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Service role can manage all profiles" ON profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Subscriptions policies
CREATE POLICY "Users can read own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage all subscriptions" ON subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Processing jobs policies
CREATE POLICY "Users can read own jobs" ON processing_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own jobs" ON processing_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs" ON processing_jobs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own jobs" ON processing_jobs FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage all jobs" ON processing_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Usage logs policies
CREATE POLICY "Users can read own usage logs" ON usage_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert usage logs" ON usage_logs FOR INSERT TO service_role WITH CHECK (true);

-- API keys policies
CREATE POLICY "Users can read own API keys" ON api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own API keys" ON api_keys FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can read all API keys" ON api_keys FOR SELECT TO service_role USING (true);

-- Audit logs policies
CREATE POLICY "Users can read own audit logs" ON audit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can write audit logs" ON audit_logs FOR INSERT TO service_role WITH CHECK (true);

-- ==================================================
-- 10. AUTH TRIGGERS (auto profile creation)
-- ==================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE v_quota INTEGER;
BEGIN
    SELECT (value)::INTEGER INTO v_quota FROM system_config WHERE key = 'default_quota_free';
    
    INSERT INTO public.profiles (id, email, full_name, avatar_url, plan, quota_limit, quota_used, email_verified, created_at, updated_at)
    VALUES (
        NEW.id, NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        'free', COALESCE(v_quota, 50), 0,
        NEW.email_confirmed_at IS NOT NULL,
        NOW(), NOW()
    );
    
    INSERT INTO public.subscriptions (user_id, plan, status, billing_cycle, price_cents, started_at)
    VALUES (NEW.id, 'free', 'active', NULL, 0, NOW());
    
    PERFORM create_audit_log(NEW.id, 'auth.signup', 'New user signed up', 'info',
        jsonb_build_object('email', NEW.email, 'provider', NEW.app_metadata->>'provider'));
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Security functions
CREATE OR REPLACE FUNCTION public.check_user_quota(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_limit INTEGER; v_used INTEGER; v_reset TIMESTAMPTZ;
BEGIN
    SELECT quota_limit, quota_used, quota_reset_at INTO v_limit, v_used, v_reset FROM profiles WHERE id = p_user_id;
    IF v_reset < NOW() - INTERVAL '1 month' THEN
        UPDATE profiles SET quota_used = 0, quota_reset_at = NOW() WHERE id = p_user_id;
        RETURN true;
    END IF;
    RETURN v_used < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_quota_usage(p_user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE profiles SET quota_used = quota_used + 1, updated_at = NOW() WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.validate_api_key(p_key_hash TEXT)
RETURNS TABLE (user_id UUID, permissions JSONB, is_valid BOOLEAN, error_message TEXT) AS $$
DECLARE v_key RECORD;
BEGIN
    SELECT * INTO v_key FROM api_keys WHERE key_hash = p_key_hash AND is_active = true;
    IF v_key IS NULL THEN RETURN QUERY SELECT NULL::UUID, '[]'::JSONB, false, 'Invalid API key'; RETURN; END IF;
    IF v_key.expires_at IS NOT NULL AND v_key.expires_at < NOW() THEN RETURN QUERY SELECT NULL::UUID, '[]'::JSONB, false, 'API key expired'; RETURN; END IF;
    UPDATE api_keys SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = v_key.id;
    RETURN QUERY SELECT v_key.user_id, v_key.permissions, true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================
-- 11. ANALYTICS VIEWS
-- ==================================================

CREATE OR REPLACE VIEW daily_usage_summary AS
SELECT DATE(created_at) as date, user_id, COUNT(*) as total_requests,
    SUM(processing_time_ms) as total_processing_time_ms, COUNT(DISTINCT endpoint) as unique_endpoints
FROM usage_logs WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY DATE(created_at), user_id;

CREATE OR REPLACE VIEW job_success_rate AS
SELECT user_id, tool_name, COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
    ROUND(COUNT(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as success_rate_percent
FROM processing_jobs WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY user_id, tool_name;

CREATE OR REPLACE VIEW active_subscriptions_summary AS
SELECT plan, status, COUNT(*) as count, SUM(price_cents) as total_revenue_cents
FROM subscriptions WHERE status = 'active' GROUP BY plan, status;

-- ==================================================
-- DONE! All tables, indexes, RLS, triggers, and
-- functions have been created successfully.
-- ==================================================
