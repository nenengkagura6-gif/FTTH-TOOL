-- ==================================================
-- FTTH TOOL - ROW LEVEL SECURITY (RLS) POLICIES
-- Multi-tenant isolation with secure access patterns
-- ==================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners (important!)
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE system_config FORCE ROW LEVEL SECURITY;

-- ==================================================
-- PROFILES TABLE POLICIES
-- ==================================================

-- Allow users to read their own profile
CREATE POLICY "Users can read own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Allow users to insert their own profile (for trigger)
CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Service role can manage all profiles
CREATE POLICY "Service role can manage all profiles"
    ON profiles FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==================================================
-- SUBSCRIPTIONS TABLE POLICIES
-- ==================================================

-- Users can read their own subscriptions
CREATE POLICY "Users can read own subscriptions"
    ON subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage subscriptions
CREATE POLICY "Service role can manage all subscriptions"
    ON subscriptions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==================================================
-- PROCESSING_JOBS TABLE POLICIES
-- ==================================================

-- Users can read their own jobs
CREATE POLICY "Users can read own jobs"
    ON processing_jobs FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create jobs for themselves
CREATE POLICY "Users can create own jobs"
    ON processing_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own jobs (for progress updates)
CREATE POLICY "Users can update own jobs"
    ON processing_jobs FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own jobs
CREATE POLICY "Users can delete own jobs"
    ON processing_jobs FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can manage all jobs (for workers)
CREATE POLICY "Service role can manage all jobs"
    ON processing_jobs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==================================================
-- USAGE_LOGS TABLE POLICIES
-- ==================================================

-- Users can read their own usage logs
CREATE POLICY "Users can read own usage logs"
    ON usage_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert usage logs
CREATE POLICY "Service role can insert usage logs"
    ON usage_logs FOR INSERT
    TO service_role
    WITH CHECK (true);

-- ==================================================
-- API_KEYS TABLE POLICIES
-- ==================================================

-- Users can read their own API keys (except full hash)
CREATE POLICY "Users can read own API keys"
    ON api_keys FOR SELECT
    USING (auth.uid() = user_id);

-- Users can manage their own API keys
CREATE POLICY "Users can manage own API keys"
    ON api_keys FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Service role can validate API keys
CREATE POLICY "Service role can read all API keys"
    ON api_keys FOR SELECT
    TO service_role
    USING (true);

-- ==================================================
-- AUDIT_LOGS TABLE POLICIES
-- ==================================================

-- Users can read their own audit logs
CREATE POLICY "Users can read own audit logs"
    ON audit_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can write audit logs
CREATE POLICY "Service role can write audit logs"
    ON audit_logs FOR INSERT
    TO service_role
    WITH CHECK (true);

-- ==================================================
-- AUTH TRIGGER FUNCTIONS
-- ==================================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_plan TEXT;
    v_quota INTEGER;
BEGIN
    -- Get default values from system config
    SELECT (value)::INTEGER INTO v_quota 
    FROM system_config 
    WHERE key = 'default_quota_free';
    
    -- Insert new profile
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        avatar_url,
        plan,
        quota_limit,
        quota_used,
        email_verified,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        'free',
        COALESCE(v_quota, 50),
        0,
        NEW.email_confirmed_at IS NOT NULL,
        NOW(),
        NOW()
    );
    
    -- Create free subscription
    INSERT INTO public.subscriptions (
        user_id,
        plan,
        status,
        billing_cycle,
        price_cents,
        started_at
    ) VALUES (
        NEW.id,
        'free',
        'active',
        NULL,
        0,
        NOW()
    );
    
    -- Log signup event
    PERFORM create_audit_log(
        NEW.id,
        'auth.signup',
        'New user signed up',
        'info',
        jsonb_build_object('email', NEW.email, 'provider', NEW.app_metadata->>'provider')
    );
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail auth
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Handle user login - update last_login_at
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles 
    SET last_login_at = NOW()
    WHERE id = NEW.user_id;
    
    PERFORM create_audit_log(
        NEW.user_id,
        'auth.login',
        'User logged in',
        'info',
        jsonb_build_object('provider', NEW.provider)
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Login trigger requires connecting to auth schema
-- This is typically done via Supabase dashboard or migration

-- ==================================================
-- SECURITY FUNCTIONS
-- ==================================================

-- Check if user has available quota
CREATE OR REPLACE FUNCTION public.check_user_quota(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_quota_limit INTEGER;
    v_quota_used INTEGER;
    v_quota_reset_at TIMESTAMPTZ;
BEGIN
    SELECT quota_limit, quota_used, quota_reset_at 
    INTO v_quota_limit, v_quota_used, v_quota_reset_at
    FROM profiles WHERE id = p_user_id;
    
    -- Reset quota if month has passed
    IF v_quota_reset_at < NOW() - INTERVAL '1 month' THEN
        UPDATE profiles 
        SET quota_used = 0, quota_reset_at = NOW()
        WHERE id = p_user_id;
        RETURN true;
    END IF;
    
    RETURN v_quota_used < v_quota_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment user quota usage
CREATE OR REPLACE FUNCTION public.increment_quota_usage(p_user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE profiles 
    SET quota_used = quota_used + 1,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Validate API key
CREATE OR REPLACE FUNCTION public.validate_api_key(p_key_hash TEXT)
RETURNS TABLE (
    user_id UUID,
    permissions JSONB,
    is_valid BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_key_record RECORD;
BEGIN
    SELECT * INTO v_key_record 
    FROM api_keys 
    WHERE key_hash = p_key_hash AND is_active = true;
    
    IF v_key_record IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, '[]'::JSONB, false, 'Invalid API key';
        RETURN;
    END IF;
    
    IF v_key_record.expires_at IS NOT NULL AND v_key_record.expires_at < NOW() THEN
        RETURN QUERY SELECT NULL::UUID, '[]'::JSONB, false, 'API key expired';
        RETURN;
    END IF;
    
    -- Update last used
    UPDATE api_keys 
    SET last_used_at = NOW(),
        usage_count = usage_count + 1
    WHERE id = v_key_record.id;
    
    RETURN QUERY SELECT 
        v_key_record.user_id,
        v_key_record.permissions,
        true,
        NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================
-- SYSTEM_CONFIG TABLE POLICIES
-- ==================================================

-- Allow read-only (SELECT) access to public & authenticated users
CREATE POLICY "Allow public read access to system_config"
    ON system_config FOR SELECT
    USING (true);

-- Allow write/all (INSERT, UPDATE, DELETE) access strictly to the service_role
CREATE POLICY "Service role can manage system_config"
    ON system_config FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==================================================
-- STORAGE BUCKET POLICIES (for file storage)
-- ==================================================

-- Create storage buckets (run in Supabase dashboard SQL editor)
-- Note: These are policy templates for Supabase Storage

/*
-- uploads bucket policies
CREATE POLICY "Users can upload files to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- outputs bucket policies
CREATE POLICY "Users can read own output files"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'outputs' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Service can write output files"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'outputs');
*/
