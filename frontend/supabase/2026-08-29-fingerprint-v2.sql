-- ====================================================================
-- FINGERPRINT v2 — 2026-08-29
-- Jalankan SETELAH 2026-08-29-security-hardening.sql
-- Idempotent: aman dijalankan berulang kali.
--
-- Konteks: lib/fingerprint.ts diganti. Versi lama (prefix "dr_") hanya
-- memakai satu sinyal — hasil render canvas. Dua laptop berbeda dengan
-- kombinasi OS + browser + GPU yang sama menghasilkan canvas yang persis
-- identik, jadi hash-nya bertabrakan dan pengguna yang tidak saling kenal
-- terbaca sebagai satu perangkat. Bagi paket gratis itu berarti terkunci
-- tanpa sebab.
--
-- Versi baru (prefix "dv2_") menggabungkan canvas, GPU via WebGL, dimensi
-- layar, zona waktu, jumlah core, dan platform.
--
-- Migrasi ini:
--   1. Menghapus pendaftaran berformat lama supaya tidak ada yang terkunci
--      saat identitas perangkatnya berubah
--   2. Memperbarui daftar nilai yang harus dilewati
--   3. Melonggarkan ambang anti-abuse dari 2 menjadi 3 akun
-- ====================================================================


-- ====================================================================
-- BAGIAN 1 — BERSIHKAN PENDAFTARAN FORMAT LAMA
-- ====================================================================
-- WAJIB dijalankan bersamaan dengan deploy frontend. Setelah algoritma
-- berganti, hash lama tidak akan pernah cocok lagi — dibiarkan, ia hanya
-- memenuhi kuota perangkat pengguna tanpa pernah dikenali.
--
-- Menghapusnya aman: pengguna otomatis terdaftar ulang saat berikutnya
-- membuka tool. Yang mereka rasakan hanya satu slot perangkat kembali
-- kosong — bukan kehilangan data apa pun.

DO $do$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.device_registrations
    WHERE device_hash NOT LIKE 'dv2\_%'
    ESCAPE '\';

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Pendaftaran perangkat format lama dihapus: %', v_deleted;
END
$do$;


-- ====================================================================
-- BAGIAN 2 — PERBARUI check_device_registration
-- ====================================================================
-- Tipe kembalian tetap jsonb, jadi CREATE OR REPLACE cukup (tanpa DROP).

CREATE OR REPLACE FUNCTION public.check_device_registration(p_device_hash TEXT, p_user_id UUID)
RETURNS JSONB AS $fn$
DECLARE
    v_caller_id UUID;
    v_user_plan TEXT;
    v_is_already_registered BOOLEAN;
    v_user_device_count INTEGER;
    v_distinct_users_on_device INTEGER;
    v_max_devices INTEGER;
    -- Berapa akun gratis pada satu perangkat sebelum diblokir.
    -- Dinaikkan dari 2 ke 3: fingerprint browser tidak akan pernah
    -- sempurna, jadi ambang yang longgar lebih baik daripada mengunci
    -- pengguna sah karena tabrakan sidik jari.
    v_free_account_limit CONSTANT INTEGER := 3;
BEGIN
    -- Hanya boleh memeriksa/mendaftarkan perangkat untuk diri sendiri.
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR v_caller_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'unauthorized',
            'message', 'Sesi tidak valid. Silakan login ulang.'
        );
    END IF;

    -- Identitas yang tidak bisa dipercaya: lewati pembatasan sepenuhnya.
    -- 'lowconfidence' dikirim frontend ketika sinyal yang terkumpul terlalu
    -- sedikit (browser mengunci canvas/WebGL, mode privasi ketat, dsb).
    -- Nilai lama tetap didaftar untuk berjaga-jaga.
    IF p_device_hash IS NULL
       OR length(trim(p_device_hash)) < 8
       OR p_device_hash IN ('server', 'lowconfidence', 'no-canvas', 'empty')
       OR p_device_hash LIKE 'fallback\_%' ESCAPE '\'
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
        v_max_devices := 1;   -- paket gratis
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

    -- Anti-abuse paket gratis: satu perangkat fisik dipakai banyak akun
    IF v_user_plan = 'free' THEN
        SELECT COUNT(DISTINCT user_id) INTO v_distinct_users_on_device
        FROM public.device_registrations
        WHERE device_hash = p_device_hash;

        IF v_distinct_users_on_device >= v_free_account_limit THEN
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


-- ====================================================================
-- VERIFIKASI
-- ====================================================================
-- 1. Tidak ada lagi hash format lama:
--      SELECT device_hash, COUNT(*) FROM public.device_registrations
--      GROUP BY device_hash ORDER BY 2 DESC LIMIT 10;
--      -> seluruh device_hash harus berawalan 'dv2_'
--      (kosong itu normal kalau belum ada yang membuka tool lagi)
--
-- 2. Ambang anti-abuse sudah 3:
--      SELECT prosrc LIKE '%v_free_account_limit CONSTANT INTEGER := 3%'
--      FROM pg_proc WHERE proname = 'check_device_registration';
--      -> harus true
--
-- 3. Identitas lemah dilewati — jalankan sebagai user biasa:
--      await supabase.rpc('check_device_registration',
--        { p_device_hash: 'lowconfidence',
--          p_user_id: (await supabase.auth.getUser()).data.user.id })
--      -> { allowed: true, reason: 'unidentifiable_device' }
-- ====================================================================
