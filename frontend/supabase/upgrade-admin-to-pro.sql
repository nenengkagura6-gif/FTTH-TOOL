-- Jalankan ini di SQL Editor Supabase untuk langsung mengaktifkan paket PRO pada akun Admin Anda

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 1. Ambil ID dari email admin Anda
  SELECT id INTO v_user_id FROM public.profiles WHERE email = 'nenengkagura6@gmail.com' LIMIT 1;
  
  IF v_user_id IS NOT NULL THEN
    -- 2. Update profile menjadi PRO dan Quota menjadi Unlimited (atau 999999)
    UPDATE public.profiles
    SET plan = 'pro',
        quota_limit = 999999
    WHERE id = v_user_id;

    -- 3. Masukkan langganan aktif agar tidak di-downgrade oleh sistem otomatis
    INSERT INTO public.subscriptions (
      user_id, plan, status, billing_cycle, price_cents, started_at, expires_at
    ) VALUES (
      v_user_id, 'pro', 'active', 'monthly', 0, NOW(), NOW() + INTERVAL '30 days'
    );
  END IF;
END $$;
