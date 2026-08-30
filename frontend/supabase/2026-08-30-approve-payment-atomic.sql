-- ====================================================================
-- APPROVE PEMBAYARAN JADI SATU TRANSAKSI — 2026-08-30
-- Jalankan di Supabase Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- Gejala: pembayaran berstatus APPROVED di panel admin, tetapi akun
-- penggunanya masih 'free' — kuota 50/50 dan semua tool terkunci.
--
-- Sebab: handleApprovePayment melakukan EMPAT penulisan terpisah dari
-- browser:
--     1. payment_confirmations.status = 'approved'
--     2. batalkan langganan aktif lama
--     3. insert langganan baru
--     4. profiles.plan + quota_limit
--
-- Tidak ada transaksi yang mengikat keempatnya. Ketika langkah 2 atau 3
-- ditolak RLS, langkah 1 SUDAH tersimpan. Pembayaran jadi tertandai
-- approved padahal penggunanya tidak pernah dinaikkan — dan karena
-- statusnya bukan 'pending' lagi, tombol approve hilang dari panel
-- sehingga tidak bisa diulang. Akun tersangkut permanen.
--
-- Perbaikan: seluruh alur dipindah ke satu fungsi database. PostgreSQL
-- menjalankan setiap fungsi dalam satu transaksi — kalau ada satu langkah
-- gagal, SEMUANYA dibatalkan. Tidak ada lagi keadaan setengah jadi.
--
-- SECURITY DEFINER juga membuatnya tidak bergantung pada policy RLS untuk
-- penulisan lintas-tabel dari browser; otorisasi diperiksa sekali di awal.
-- ====================================================================


-- ====================================================================
-- BAGIAN 1 — FUNGSI APPROVE
-- ====================================================================

CREATE OR REPLACE FUNCTION public.approve_payment(p_payment_id UUID)
RETURNS JSONB AS $fn$
DECLARE
    v_pay        RECORD;
    v_quota      INTEGER;
    v_days       INTEGER;
    v_expires    TIMESTAMPTZ;
BEGIN
    -- Hanya admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh menyetujui pembayaran'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_pay
    FROM public.payment_confirmations
    WHERE id = p_payment_id;

    IF v_pay IS NULL THEN
        RAISE EXCEPTION 'Pembayaran % tidak ditemukan', p_payment_id
            USING ERRCODE = '22023';
    END IF;

    -- Kuota mengikuti paket
    v_quota := CASE v_pay.plan
                   WHEN 'basic'      THEN 500
                   WHEN 'pro'        THEN 99999
                   WHEN 'enterprise' THEN 99999
                   ELSE 50
               END;

    -- Masa aktif mengikuti siklus tagihan
    v_days := CASE WHEN v_pay.billing_cycle = 'yearly' THEN 365 ELSE 30 END;
    v_expires := NOW() + (v_days || ' days')::INTERVAL;

    -- 1. Tandai pembayaran disetujui
    UPDATE public.payment_confirmations
    SET status = 'approved',
        updated_at = NOW()
    WHERE id = p_payment_id;

    -- 2. Hentikan langganan berjalan agar tidak ada dua baris aktif
    UPDATE public.subscriptions
    SET status = 'cancelled',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE user_id = v_pay.user_id
      AND status = 'active';

    -- 3. Buat langganan baru
    INSERT INTO public.subscriptions (
        user_id, plan, status, billing_cycle, price_cents, currency,
        started_at, expires_at, payment_provider, provider_subscription_id
    ) VALUES (
        v_pay.user_id, v_pay.plan, 'active', v_pay.billing_cycle,
        v_pay.price_cents, COALESCE(v_pay.currency, 'IDR'),
        NOW(), v_expires, 'manual',
        'manual_' || left(replace(p_payment_id::text, '-', ''), 8)
    );

    -- 4. Naikkan paket penggunanya
    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles
    SET plan = v_pay.plan,
        quota_limit = v_quota,
        quota_used = 0,
        updated_at = NOW()
    WHERE id = v_pay.user_id;

    PERFORM set_config('app.profile_guard_bypass', 'off', true);

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_pay.user_id,
        'plan', v_pay.plan,
        'quota_limit', v_quota,
        'expires_at', v_expires
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.approve_payment(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.approve_payment(UUID) TO authenticated;


-- ====================================================================
-- BAGIAN 2 — FUNGSI UBAH PAKET MANUAL (dropdown panel admin)
-- ====================================================================
-- Alasan sama: dropdown paket juga menulis ke dua tabel berurutan.

CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
    p_user_id UUID,
    p_plan    TEXT,
    p_days    INTEGER DEFAULT 30
)
RETURNS JSONB AS $fn$
DECLARE
    v_quota   INTEGER;
    v_expires TIMESTAMPTZ;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh mengubah paket'
            USING ERRCODE = '42501';
    END IF;

    IF p_plan NOT IN ('free', 'basic', 'pro', 'enterprise') THEN
        RAISE EXCEPTION 'Paket tidak dikenali: %', p_plan USING ERRCODE = '22023';
    END IF;

    v_quota := CASE p_plan
                   WHEN 'basic'      THEN 500
                   WHEN 'pro'        THEN 99999
                   WHEN 'enterprise' THEN 99999
                   ELSE 50
               END;

    -- Hentikan langganan berjalan
    UPDATE public.subscriptions
    SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
    WHERE user_id = p_user_id AND status = 'active';

    IF p_plan <> 'free' THEN
        v_expires := NOW() + (p_days || ' days')::INTERVAL;
        INSERT INTO public.subscriptions (
            user_id, plan, status, billing_cycle, currency,
            started_at, expires_at, payment_provider, provider_subscription_id
        ) VALUES (
            p_user_id, p_plan, 'active', 'monthly', 'IDR',
            NOW(), v_expires, 'manual',
            'admin_' || left(replace(gen_random_uuid()::text, '-', ''), 8)
        );
    END IF;

    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles
    SET plan = p_plan, quota_limit = v_quota, updated_at = NOW()
    WHERE id = p_user_id;

    PERFORM set_config('app.profile_guard_bypass', 'off', true);

    RETURN jsonb_build_object(
        'success', true, 'plan', p_plan,
        'quota_limit', v_quota, 'expires_at', v_expires
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_plan(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_plan(UUID, TEXT, INTEGER) TO authenticated;


-- ====================================================================
-- BAGIAN 3 — PERBAIKI AKUN YANG SUDAH TERSANGKUT
-- ====================================================================
-- Pembayaran yang terlanjur berstatus 'approved' tetapi penggunanya tidak
-- pernah dinaikkan. Ini yang menyebabkan akun uji Anda masih terkunci
-- meski panel admin menampilkan APPROVED.

DO $do$
DECLARE
    r RECORD;
    v_quota INTEGER;
    v_days  INTEGER;
    v_n     INTEGER := 0;
BEGIN
    FOR r IN
        SELECT pc.*
        FROM public.payment_confirmations pc
        JOIN public.profiles p ON p.id = pc.user_id
        WHERE pc.status = 'approved'
          AND p.plan IS DISTINCT FROM pc.plan
    LOOP
        v_quota := CASE r.plan
                       WHEN 'basic' THEN 500
                       WHEN 'pro' THEN 99999
                       WHEN 'enterprise' THEN 99999
                       ELSE 50 END;
        v_days := CASE WHEN r.billing_cycle = 'yearly' THEN 365 ELSE 30 END;

        UPDATE public.subscriptions
        SET status = 'cancelled', cancelled_at = NOW()
        WHERE user_id = r.user_id AND status = 'active';

        INSERT INTO public.subscriptions (
            user_id, plan, status, billing_cycle, price_cents, currency,
            started_at, expires_at, payment_provider, provider_subscription_id
        ) VALUES (
            r.user_id, r.plan, 'active', r.billing_cycle,
            r.price_cents, COALESCE(r.currency, 'IDR'),
            NOW(), NOW() + (v_days || ' days')::INTERVAL, 'manual',
            'repair_' || left(replace(r.id::text, '-', ''), 8)
        );

        PERFORM set_config('app.profile_guard_bypass', 'on', true);
        UPDATE public.profiles
        SET plan = r.plan, quota_limit = v_quota, quota_used = 0, updated_at = NOW()
        WHERE id = r.user_id;
        PERFORM set_config('app.profile_guard_bypass', 'off', true);

        v_n := v_n + 1;
        RAISE NOTICE 'Diperbaiki: user % -> paket %', r.user_id, r.plan;
    END LOOP;

    RAISE NOTICE 'Total akun tersangkut yang diperbaiki: %', v_n;
END
$do$;


-- ====================================================================
-- HASIL — statement terakhir, jadi tabel ini yang tampil
-- ====================================================================
SELECT
    p.email,
    p.plan            AS paket_profil,
    p.quota_limit     AS kuota,
    pc.plan           AS paket_dibayar,
    pc.status         AS status_bayar,
    s.status          AS status_langganan,
    s.expires_at,
    CASE WHEN p.plan IS DISTINCT FROM pc.plan
         THEN 'MASIH TIDAK COCOK'
         ELSE 'cocok' END AS keterangan
FROM public.payment_confirmations pc
JOIN public.profiles p ON p.id = pc.user_id
LEFT JOIN public.subscriptions s
       ON s.user_id = p.id AND s.status = 'active'
WHERE pc.status = 'approved'
ORDER BY pc.created_at DESC;
