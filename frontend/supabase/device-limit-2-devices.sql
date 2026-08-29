-- ====================================================================
-- MIGRATION: 2 Device Limit per Account for Basic & Pro Subscriptions
-- Run this in the Supabase Dashboard SQL Editor
-- ====================================================================

-- 1. Create or replace check_device_registration function
CREATE OR REPLACE FUNCTION public.check_device_registration(p_device_hash TEXT, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_user_plan TEXT;
    v_is_already_registered BOOLEAN;
    v_user_device_count INTEGER;
    v_distinct_users_on_device INTEGER;
    v_max_devices INTEGER;
BEGIN
    -- Get user plan from profiles table
    SELECT plan INTO v_user_plan FROM public.profiles WHERE id = p_user_id;
    IF v_user_plan IS NULL THEN
        v_user_plan := 'free';
    END IF;

    -- Enterprise plan has unlimited devices
    IF v_user_plan = 'enterprise' THEN
        RETURN jsonb_build_object(
            'allowed', true, 
            'reason', 'enterprise_unlimited',
            'plan', v_user_plan,
            'max_devices', 999
        );
    END IF;

    -- Determine max devices allowed per user account based on plan
    IF v_user_plan IN ('basic', 'pro') THEN
        v_max_devices := 2; -- Max 2 devices (e.g. 1 Laptop + 1 Mobile)
    ELSE
        v_max_devices := 1; -- Max 1 device for Free plan
    END IF;

    -- Check if user is already registered for this specific device
    SELECT EXISTS(
        SELECT 1 FROM public.device_registrations 
        WHERE device_hash = p_device_hash AND user_id = p_user_id
    ) INTO v_is_already_registered;

    -- If this device is already registered for this user, allow access!
    IF v_is_already_registered THEN
        SELECT COUNT(DISTINCT device_hash) INTO v_user_device_count 
        FROM public.device_registrations 
        WHERE user_id = p_user_id;

        RETURN jsonb_build_object(
            'allowed', true, 
            'reason', 'already_registered',
            'plan', v_user_plan,
            'max_devices', v_max_devices,
            'current_devices', v_user_device_count
        );
    END IF;

    -- Anti-abuse check for Free plan: Prevent 1 physical device from being used by 2+ free accounts
    IF v_user_plan = 'free' THEN
        SELECT COUNT(DISTINCT user_id) INTO v_distinct_users_on_device 
        FROM public.device_registrations 
        WHERE device_hash = p_device_hash;

        IF v_distinct_users_on_device >= 2 THEN
            RETURN jsonb_build_object(
                'allowed', false, 
                'reason', 'device_free_limit_exceeded',
                'plan', v_user_plan,
                'max_devices', v_max_devices,
                'message', 'Perangkat ini telah dikaitkan dengan beberapa akun gratis. Upgrade ke Basic/Pro untuk membuka akses.'
            );
        END IF;
    END IF;

    -- Count how many distinct devices are ALREADY registered for this user account
    SELECT COUNT(DISTINCT device_hash) INTO v_user_device_count 
    FROM public.device_registrations 
    WHERE user_id = p_user_id;

    -- If user has reached their plan's maximum registered devices, BLOCK access
    IF v_user_device_count >= v_max_devices THEN
        RETURN jsonb_build_object(
            'allowed', false, 
            'reason', 'account_device_limit_exceeded',
            'plan', v_user_plan,
            'max_devices', v_max_devices,
            'current_devices', v_user_device_count,
            'message', format('Akun Anda (%s) telah terdaftar di %s perangkat lain. Batas maksimal adalah %s perangkat (misal: 1 Laptop + 1 HP).', UPPER(v_user_plan), v_user_device_count, v_max_devices)
        );
    END IF;

    -- Otherwise, register the new device for this user
    INSERT INTO public.device_registrations (device_hash, user_id)
    VALUES (p_device_hash, p_user_id)
    ON CONFLICT (device_hash, user_id) DO NOTHING;

    RETURN jsonb_build_object(
        'allowed', true, 
        'reason', 'new_device_registered',
        'plan', v_user_plan,
        'max_devices', v_max_devices,
        'current_devices', v_user_device_count + 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper function to reset registered devices for a user
CREATE OR REPLACE FUNCTION public.reset_user_devices(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_deleted_count INTEGER;
BEGIN
    v_caller_id := auth.uid();
    
    -- Must be authenticated and resetting own devices (or admin)
    IF v_caller_id IS NULL OR (v_caller_id != p_user_id AND NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = v_caller_id AND plan = 'enterprise'
    )) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    DELETE FROM public.device_registrations WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Enable RLS & Policies
ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own device registrations" ON public.device_registrations;
CREATE POLICY "Users can view their own device registrations" 
ON public.device_registrations FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own device registrations" ON public.device_registrations;
CREATE POLICY "Users can delete their own device registrations" 
ON public.device_registrations FOR DELETE 
USING (auth.uid() = user_id);
