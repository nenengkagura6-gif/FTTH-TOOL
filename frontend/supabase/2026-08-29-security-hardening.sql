-- ====================================================================
-- SECURITY HARDENING — 2026-08-29
-- Jalankan SELURUH file ini di Supabase Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- Memperbaiki 4 kerentanan kritis:
--   1. User bisa mengubah plan/role/quota dirinya sendiri (privilege escalation)
--   2. Bukti transfer bank bisa dibaca & dienumerasi publik
--   3. check_device_registration bisa dipakai mengunci akun user lain
--   4. Fungsi SECURITY DEFINER tanpa search_path + EXECUTE terbuka ke anon
-- ====================================================================


-- ====================================================================
-- BAGIAN 1 — KUNCI KOLOM ISTIMEWA DI TABEL profiles
-- ====================================================================
-- Masalah: policy "Users can update own profile" mengizinkan UPDATE ke
-- SEMUA kolom. User bisa menjalankan dari console browser:
--     supabase.from('profiles').update({ plan:'enterprise', role:'admin' })
--
-- Solusi: trigger BEFORE UPDATE yang menolak perubahan kolom istimewa,
-- kecuali pemanggilnya service_role, admin, atau fungsi tepercaya yang
-- sudah menyalakan flag bypass.
--
-- Catatan: flag bypass adalah GUC kustom. PostgREST tidak mengizinkan
-- client menyetel GUC kustom, dan tidak ada RPC exec_sql di project ini,
-- jadi flag ini tidak bisa dinyalakan dari luar.

-- Pengaman: trigger di bawah membaca kolom role. Kolom ini ditambahkan
-- oleh 03-storage.sql; kalau migrasi itu belum pernah dijalankan, trigger
-- akan error saat UPDATE pertama.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_jwt_role TEXT;
BEGIN
    -- 1. Fungsi tepercaya (lihat Bagian 2) menyalakan flag ini lebih dulu
    IF coalesce(current_setting('app.profile_guard_bypass', true), 'off') = 'on' THEN
        RETURN NEW;
    END IF;

    -- 2. Tanpa JWT sama sekali = SQL Editor / koneksi langsung / service key
    v_jwt_role := current_setting('request.jwt.claims', true);
    IF v_jwt_role IS NULL OR v_jwt_role = '' THEN
        RETURN NEW;
    END IF;

    IF (v_jwt_role::jsonb ->> 'role') = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- 3. Admin boleh mengubah apa pun (dipakai panel /admin)
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN NEW;
    END IF;

    -- 4. User biasa: kolom istimewa wajib tidak berubah
    IF NEW.plan        IS DISTINCT FROM OLD.plan
    OR NEW.role        IS DISTINCT FROM OLD.role
    OR NEW.quota_limit IS DISTINCT FROM OLD.quota_limit
    OR NEW.quota_used  IS DISTINCT FROM OLD.quota_used
    OR NEW.is_active   IS DISTINCT FROM OLD.is_active
    OR NEW.email       IS DISTINCT FROM OLD.email
    OR NEW.id          IS DISTINCT FROM OLD.id
    THEN
        RAISE EXCEPTION
            'Kolom plan/role/quota/is_active/email hanya bisa diubah oleh admin atau sistem billing.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS tr_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER tr_protect_profile_privileged_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_privileged_columns();


-- ====================================================================
-- BAGIAN 2 — IZINKAN FUNGSI SISTEM TEPERCAYA MELEWATI GUARD
-- ====================================================================
-- Ketiga fungsi ini memang HARUS menulis kolom istimewa. Tanpa flag
-- bypass, trigger di Bagian 1 akan memblokir mereka dan merusak
-- penambahan kuota + auto-downgrade langganan.

-- 2a. Penambah kuota (dipanggil trigger tr_on_job_completed)
CREATE OR REPLACE FUNCTION public.increment_quota_usage(p_user_id UUID)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles
    SET quota_used = quota_used + 1,
        updated_at = NOW()
    WHERE id = p_user_id;

    PERFORM set_config('app.profile_guard_bypass', 'off', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2b. Auto-downgrade langganan kedaluwarsa (dipanggil saat user login)
CREATE OR REPLACE FUNCTION public.refresh_subscription_status()
RETURNS void AS $$
DECLARE
    v_default_free_quota INTEGER;
BEGIN
    SELECT (value)::INTEGER INTO v_default_free_quota
    FROM public.system_config WHERE key = 'default_quota_free';

    IF v_default_free_quota IS NULL THEN
        v_default_free_quota := 50;
    END IF;

    PERFORM set_config('app.profile_guard_bypass', 'on', true);

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

    PERFORM set_config('app.profile_guard_bypass', 'off', true);

    UPDATE public.subscriptions
    SET status = 'expired'
    WHERE user_id = auth.uid() AND status = 'active' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2c. Reset kuota bulanan (dipanggil scheduler / pg_cron)
CREATE OR REPLACE FUNCTION public.reset_monthly_quotas()
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles
    SET quota_used = 0,
        quota_reset_at = NOW(),
        updated_at = NOW()
    WHERE quota_reset_at < NOW() - INTERVAL '1 month';

    PERFORM set_config('app.profile_guard_bypass', 'off', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- ====================================================================
-- BAGIAN 3 — BUCKET receipts JADI PRIVAT
-- ====================================================================
-- Masalah: bucket dibuat public:true DAN diberi policy SELECT "TO public".
-- Kombinasi itu membuat siapa pun (tanpa login) bisa meng-enumerasi
-- seluruh isi bucket lewat storage list API lalu mengunduh setiap bukti
-- transfer — berisi nama, bank, nominal, dan foto struk.

UPDATE storage.buckets
SET public = false
WHERE id = 'receipts';

-- Buang policy lama yang terbuka
DROP POLICY IF EXISTS "Public read receipts" ON storage.objects;

-- User hanya boleh membaca struk miliknya sendiri
DROP POLICY IF EXISTS "Users can read own receipts" ON storage.objects;
CREATE POLICY "Users can read own receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admin boleh membaca semua struk (untuk verifikasi pembayaran)
DROP POLICY IF EXISTS "Admins can read all receipts" ON storage.objects;
CREATE POLICY "Admins can read all receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );


-- ====================================================================
-- BAGIAN 4 — check_device_registration: WAJIB CEK auth.uid()
-- ====================================================================
-- Masalah: fungsi ini SECURITY DEFINER tapi tidak pernah memverifikasi
-- bahwa p_user_id == auth.uid(). Penyerang cukup memanggilnya 2x dengan
-- user_id korban + hash acak untuk memenuhi kuota perangkat korban,
-- sehingga korban terkunci dari seluruh dashboard. Response-nya juga
-- membocorkan plan milik user lain.
--
-- CATATAN: versi yang aktif di database mengembalikan BOOLEAN (berasal
-- dari add-basic-plan-migration.sql). PostgreSQL tidak mengizinkan
-- CREATE OR REPLACE mengubah tipe kembalian, jadi fungsi lama harus
-- di-DROP lebih dulu. Frontend sudah menangani kedua bentuk respons
-- (boolean maupun objek JSON), jadi tidak ada perubahan client yang perlu.

DROP FUNCTION IF EXISTS public.check_device_registration(TEXT, UUID);

CREATE FUNCTION public.check_device_registration(p_device_hash TEXT, p_user_id UUID)
RETURNS JSONB AS $fn$
DECLARE
    v_caller_id UUID;
    v_user_plan TEXT;
    v_is_already_registered BOOLEAN;
    v_user_device_count INTEGER;
    v_distinct_users_on_device INTEGER;
    v_max_devices INTEGER;
BEGIN
    -- >>> GERBANG KEAMANAN BARU <<<
    -- Hanya boleh memeriksa/mendaftarkan perangkat untuk diri sendiri.
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR v_caller_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'unauthorized',
            'message', 'Sesi tidak valid. Silakan login ulang.'
        );
    END IF;

    -- Tolak device hash kosong / placeholder yang dipakai bersama banyak user
    IF p_device_hash IS NULL
       OR length(trim(p_device_hash)) < 4
       OR p_device_hash IN ('server', 'no-canvas', 'empty')
    THEN
        RETURN jsonb_build_object(
            'allowed', true,
            'reason', 'unidentifiable_device',
            'message', 'Perangkat tidak dapat diidentifikasi; pembatasan dilewati.'
        );
    END IF;

    SELECT plan INTO v_user_plan FROM public.profiles WHERE id = p_user_id;
    IF v_user_plan IS NULL THEN
        v_user_plan := 'free';
    END IF;

    IF v_user_plan = 'enterprise' THEN
        RETURN jsonb_build_object(
            'allowed', true,
            'reason', 'enterprise_unlimited',
            'plan', v_user_plan,
            'max_devices', 999
        );
    END IF;

    IF v_user_plan IN ('basic', 'pro') THEN
        v_max_devices := 2;   -- misal: 1 laptop + 1 HP
    ELSE
        v_max_devices := 1;   -- plan free
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.device_registrations
        WHERE device_hash = p_device_hash AND user_id = p_user_id
    ) INTO v_is_already_registered;

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

    -- Anti-abuse plan free: 1 perangkat fisik dipakai banyak akun gratis
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

    SELECT COUNT(DISTINCT device_hash) INTO v_user_device_count
    FROM public.device_registrations
    WHERE user_id = p_user_id;

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
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- --------------------------------------------------------------------
-- 4b. reset_user_devices + RLS device_registrations
-- --------------------------------------------------------------------
-- Fungsi ini dipanggil frontend (tombol "Reset Perangkat" di tool-page),
-- tapi hanya didefinisikan di device-limit-2-devices.sql yang ternyata
-- belum pernah dijalankan — jadi dibuat di sini supaya tombolnya bekerja.

CREATE OR REPLACE FUNCTION public.reset_user_devices(p_user_id UUID)
RETURNS JSONB AS $fn$
DECLARE
    v_caller_id UUID;
    v_deleted_count INTEGER;
BEGIN
    v_caller_id := auth.uid();

    -- Harus terautentikasi dan mereset perangkat miliknya sendiri (atau admin)
    IF v_caller_id IS NULL OR (v_caller_id IS DISTINCT FROM p_user_id AND NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'admin'
    )) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    DELETE FROM public.device_registrations WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own device registrations" ON public.device_registrations;
CREATE POLICY "Users can view their own device registrations"
ON public.device_registrations FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own device registrations" ON public.device_registrations;
CREATE POLICY "Users can delete their own device registrations"
ON public.device_registrations FOR DELETE
USING (auth.uid() = user_id);


-- ====================================================================
-- BAGIAN 5 — search_path UNTUK SISA FUNGSI SECURITY DEFINER
-- ====================================================================
-- Tanpa search_path yang dipatok, fungsi SECURITY DEFINER rawan
-- search_path hijacking (juga di-flag oleh Supabase linter).
--
-- Ditulis sebagai loop atas pg_proc supaya fungsi yang belum ada di
-- database ini dilewati begitu saja, bukan menggagalkan seluruh script.

DO $do$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'reset_user_devices',
              'is_admin',
              'handle_job_completion',
              'get_admin_payments',
              'check_user_quota',
              'handle_new_user',
              'handle_user_login',
              'validate_api_key'
          )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
        RAISE NOTICE 'search_path dipatok: %', r.sig;
    END LOOP;
END
$do$;


-- ====================================================================
-- BAGIAN 6 — CABUT HAK EXECUTE DARI ROLE anon
-- ====================================================================
-- Secara default PostgreSQL memberi EXECUTE ke PUBLIC, artinya
-- pengunjung yang belum login pun bisa memanggil RPC ini.
--
-- Sama seperti Bagian 5: fungsi yang tidak ada dilewati.

DO $do$
DECLARE
    r RECORD;
    -- Boleh dipanggil user yang sudah login
    v_user_fns TEXT[] := ARRAY[
        'check_device_registration',
        'reset_user_devices',
        'refresh_subscription_status',
        'get_admin_payments',
        'check_user_quota'
    ];
    -- Hanya untuk sistem — tidak boleh dipanggil client sama sekali
    v_system_fns TEXT[] := ARRAY[
        'increment_quota_usage',
        'reset_monthly_quotas'
    ];
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig, p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY(v_user_fns || v_system_fns)
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);

        IF r.proname = ANY(v_user_fns) THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
            RAISE NOTICE 'EXECUTE dibatasi ke authenticated: %', r.sig;
        ELSE
            RAISE NOTICE 'EXECUTE dicabut sepenuhnya dari client: %', r.sig;
        END IF;
    END LOOP;
END
$do$;


-- ====================================================================
-- VERIFIKASI — jalankan query di bawah setelah migrasi
-- ====================================================================
-- 1. Bucket receipts harus privat:
--      SELECT id, public FROM storage.buckets WHERE id = 'receipts';
--      -> public harus false
--
-- 2. Trigger guard harus terpasang:
--      SELECT tgname FROM pg_trigger
--      WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;
--      -> harus ada tr_protect_profile_privileged_columns
--
-- 3. Uji privilege escalation dari console browser sebagai user biasa:
--      await supabase.from('profiles')
--        .update({ plan: 'enterprise' })
--        .eq('id', (await supabase.auth.getUser()).data.user.id)
--      -> harus GAGAL dengan error 42501
--
-- 4. Uji device lock-out sebagai user biasa (ganti UUID dengan user lain):
--      await supabase.rpc('check_device_registration',
--        { p_device_hash: 'test123', p_user_id: '<uuid-user-lain>' })
--      -> harus mengembalikan { allowed: false, reason: 'unauthorized' }
-- ====================================================================
