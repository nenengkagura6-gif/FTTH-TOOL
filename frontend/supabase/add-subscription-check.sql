-- ==================================================
-- MIGRATION: Subscription Auto-Downgrade & Admin Profile Access
-- Run this in the Supabase Dashboard SQL Editor
-- ==================================================

-- 1. Create a safe function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Allow Admins to read all profiles (Fixes the missing email issue in Payment Verifications)
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- 3. Create a function to check and downgrade expired subscriptions
-- This will be called securely from the frontend when a user logs in or opens the app
CREATE OR REPLACE FUNCTION public.refresh_subscription_status()
RETURNS void AS $$
DECLARE
    v_default_free_quota INTEGER;
BEGIN
    -- Get the default free quota from system config
    SELECT (value)::INTEGER INTO v_default_free_quota 
    FROM system_config WHERE key = 'default_quota_free';
    
    IF v_default_free_quota IS NULL THEN
        v_default_free_quota := 50;
    END IF;

    -- Update profiles to free where they have an active subscription that has expired
    UPDATE public.profiles p
    SET plan = 'free', 
        quota_limit = v_default_free_quota
    WHERE p.id = auth.uid() 
      AND p.plan != 'free'
      AND EXISTS (
          SELECT 1 FROM public.subscriptions s 
          WHERE s.user_id = p.id 
            AND s.status = 'active' 
            AND s.expires_at < NOW()
      );

    -- Mark those subscriptions as expired
    UPDATE public.subscriptions
    SET status = 'expired'
    WHERE user_id = auth.uid() AND status = 'active' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
