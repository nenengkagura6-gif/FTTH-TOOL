-- FIX: Create missing profiles for existing Google users
-- Paste this in Supabase SQL Editor → Run without RLS

-- Step 1: Grant permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;

-- Step 2: Fix trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE v_quota INTEGER;
BEGIN
    SELECT (value)::INTEGER INTO v_quota FROM system_config WHERE key = 'default_quota_free';
    
    INSERT INTO public.profiles (id, email, full_name, avatar_url, plan, quota_limit, quota_used, email_verified, created_at, updated_at)
    VALUES (
        NEW.id, NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
        'free', COALESCE(v_quota, 50), 0,
        NEW.email_confirmed_at IS NOT NULL,
        NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING;
    
    INSERT INTO public.subscriptions (user_id, plan, status, price_cents, started_at)
    VALUES (NEW.id, 'free', 'active', 0, NOW())
    ON CONFLICT DO NOTHING;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 3: Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 4: Backfill profiles for existing users
INSERT INTO public.profiles (id, email, full_name, avatar_url, plan, quota_limit, quota_used, email_verified, created_at, updated_at)
SELECT 
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
    COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
    'free', 50, 0,
    u.email_confirmed_at IS NOT NULL,
    u.created_at, NOW()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Step 5: Create subscriptions for users without one
INSERT INTO public.subscriptions (user_id, plan, status, price_cents, started_at)
SELECT p.id, 'free', 'active', 0, NOW()
FROM public.profiles p
LEFT JOIN public.subscriptions s ON s.user_id = p.id
WHERE s.id IS NULL;

-- Verify result
SELECT id, email, full_name, plan, quota_limit FROM public.profiles;
