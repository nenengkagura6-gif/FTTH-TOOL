-- ====================================================================
-- MIGRATION: Add Basic Plan Tier & Device Fingerprint Anti-Abuse
-- Run this in the Supabase Dashboard SQL Editor
-- ====================================================================

-- 1. Alter profiles plan check constraint to include 'basic'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('free', 'basic', 'pro', 'enterprise'));

-- 2. Alter subscriptions plan check constraint to include 'basic'
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN ('free', 'basic', 'pro', 'enterprise'));

-- 3. Create device registrations table
CREATE TABLE IF NOT EXISTS public.device_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_hash TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;

-- Ensure a user/device pair is unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_regs_device_user ON public.device_registrations(device_hash, user_id);
CREATE INDEX IF NOT EXISTS idx_device_regs_device ON public.device_registrations(device_hash);

-- 4. Create checking RPC function
CREATE OR REPLACE FUNCTION public.check_device_registration(p_device_hash TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_distinct_users INTEGER;
    v_is_already_registered BOOLEAN;
    v_user_plan TEXT;
BEGIN
    -- Get user plan
    SELECT plan INTO v_user_plan FROM public.profiles WHERE id = p_user_id;

    -- If user is on Basic, Pro, or Enterprise, they bypass the device lock check
    IF v_user_plan IN ('basic', 'pro', 'enterprise') THEN
        RETURN true;
    END IF;

    -- Check if user is already registered for this device
    SELECT EXISTS(
        SELECT 1 FROM public.device_registrations 
        WHERE device_hash = p_device_hash AND user_id = p_user_id
    ) INTO v_is_already_registered;

    -- If already registered, allow access
    IF v_is_already_registered THEN
        RETURN true;
    END IF;

    -- Count distinct users on this device
    SELECT COUNT(DISTINCT user_id) INTO v_distinct_users 
    FROM public.device_registrations 
    WHERE device_hash = p_device_hash;

    -- If not registered and device is already associated with 2 or more users, block it
    IF v_distinct_users >= 2 THEN
        RETURN false;
    END IF;

    -- Otherwise, register the new user/device pair
    INSERT INTO public.device_registrations (device_hash, user_id)
    VALUES (p_device_hash, p_user_id);

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
