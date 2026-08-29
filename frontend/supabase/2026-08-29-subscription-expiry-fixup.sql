-- ====================================================================
-- LANJUTAN PERBAIKAN KEDALUWARSA — 2026-08-29 (fixup)
-- Jalankan SETELAH 2026-08-29-subscription-expiry.sql
-- Idempotent: aman dijalankan berulang kali.
--
-- Verifikasi setelah migrasi sebelumnya menemukan tiga akun 'pro' dengan
-- expires_at = NULL. Mereka tetap abadi, karena migrasi itu memperlakukan
-- expires_at IS NULL sebagai "langganan permanen yang masih berlaku":
--
--     AND (s.expires_at IS NULL OR s.expires_at > NOW())
--
-- Akibatnya backfill melewatinya (EXISTS sudah true) dan mesin
-- kedaluwarsa menganggapnya masih aktif.
--
-- Keputusan itu keliru untuk layanan berbayar. Langganan tanpa tanggal
-- akhir tidak boleh dianggap sah; pemberian permanen harus memakai
-- tanggal jauh di depan secara eksplisit — seperti akun admin yang sudah
-- memakai 2099-12-31.
--
-- Urutannya sengaja: beri tanggal dulu, baru perketat aturannya. Kalau
-- dibalik, ketiga akun itu langsung turun tanpa peringatan.
-- ====================================================================


-- ====================================================================
-- BAGIAN 1 — BERI TANGGAL PADA LANGGANAN YANG BELUM PUNYA
-- ====================================================================
-- Setiap langganan aktif tanpa expires_at diberi 30 hari dari sekarang.
-- Ini memberi ruang: mereka tidak turun mendadak hari ini, tapi mulai
-- punya akhir yang nyata.

DO $do$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.subscriptions
    SET expires_at = NOW() + INTERVAL '30 days',
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb)
                   || jsonb_build_object('expiry_backfilled', '2026-08-29')
    WHERE status = 'active'
      AND expires_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Langganan tanpa tanggal akhir diberi 30 hari: %', v_count;
END
$do$;


-- ====================================================================
-- BAGIAN 2 — RAPIKAN LANGGANAN AKTIF GANDA
-- ====================================================================
-- Beberapa user punya lebih dari satu baris 'active' (mis. akun admin).
-- Sisakan yang paling akhir berakhir; sisanya ditandai cancelled.

DO $do$
DECLARE
    v_count INTEGER;
BEGIN
    WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY user_id
                   ORDER BY expires_at DESC NULLS LAST, created_at DESC
               ) AS rn
        FROM public.subscriptions
        WHERE status = 'active'
    )
    UPDATE public.subscriptions s
    SET status = 'cancelled',
        cancelled_at = NOW(),
        updated_at = NOW()
    FROM ranked r
    WHERE s.id = r.id AND r.rn > 1;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Langganan aktif ganda dibatalkan: %', v_count;
END
$do$;


-- ====================================================================
-- BAGIAN 3 — PERKETAT: TANPA TANGGAL = TIDAK SAH
-- ====================================================================
-- Sekarang semua langganan aktif sudah punya tanggal, jadi aturannya
-- bisa diperketat tanpa menurunkan siapa pun secara mendadak.

CREATE OR REPLACE FUNCTION public.expire_due_subscriptions()
RETURNS JSONB AS $fn$
DECLARE
    v_default_free_quota INTEGER;
    v_expired  INTEGER := 0;
    v_demoted  INTEGER := 0;
BEGIN
    SELECT (value)::INTEGER INTO v_default_free_quota
    FROM public.system_config WHERE key = 'default_quota_free';

    IF v_default_free_quota IS NULL THEN
        v_default_free_quota := 50;
    END IF;

    -- 1. Tandai langganan yang sudah lewat tanggal.
    --    expires_at IS NULL ikut dikedaluwarsakan: langganan tanpa akhir
    --    tidak dianggap sah lagi.
    UPDATE public.subscriptions
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'active'
      AND (expires_at IS NULL OR expires_at < NOW());

    GET DIAGNOSTICS v_expired = ROW_COUNT;

    -- 2. Turunkan plan berbayar yang tidak lagi punya langganan aktif
    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles p
    SET plan = 'free',
        quota_limit = v_default_free_quota,
        updated_at = NOW()
    WHERE p.plan <> 'free'
      AND COALESCE(p.role, 'user') <> 'admin'
      AND NOT EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.user_id = p.id
            AND s.status = 'active'
            AND s.expires_at IS NOT NULL
            AND s.expires_at > NOW()
      );

    GET DIAGNOSTICS v_demoted = ROW_COUNT;

    PERFORM set_config('app.profile_guard_bypass', 'off', true);

    RETURN jsonb_build_object(
        'subscriptions_expired', v_expired,
        'profiles_demoted', v_demoted,
        'ran_at', NOW()
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.expire_due_subscriptions() FROM PUBLIC, anon, authenticated;


-- ====================================================================
-- BAGIAN 4 — SAMAKAN ATURAN DI VERSI PER-USER
-- ====================================================================

CREATE OR REPLACE FUNCTION public.refresh_subscription_status()
RETURNS void AS $fn$
DECLARE
    v_uid UUID;
    v_default_free_quota INTEGER;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    SELECT (value)::INTEGER INTO v_default_free_quota
    FROM public.system_config WHERE key = 'default_quota_free';

    IF v_default_free_quota IS NULL THEN
        v_default_free_quota := 50;
    END IF;

    UPDATE public.subscriptions
    SET status = 'expired',
        updated_at = NOW()
    WHERE user_id = v_uid
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at < NOW());

    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles p
    SET plan = 'free',
        quota_limit = v_default_free_quota,
        updated_at = NOW()
    WHERE p.id = v_uid
      AND p.plan <> 'free'
      AND COALESCE(p.role, 'user') <> 'admin'
      AND NOT EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.user_id = v_uid
            AND s.status = 'active'
            AND s.expires_at IS NOT NULL
            AND s.expires_at > NOW()
      );

    PERFORM set_config('app.profile_guard_bypass', 'off', true);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.refresh_subscription_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.refresh_subscription_status() TO authenticated;


-- ====================================================================
-- HASIL — statement terakhir, jadi tabel ini yang tampil
-- ====================================================================
SELECT
    p.email,
    p.plan,
    p.quota_limit,
    s.status AS status_langganan,
    s.expires_at,
    CASE
        WHEN COALESCE(p.role, 'user') = 'admin' THEN 'admin — dikecualikan'
        WHEN s.id IS NULL                       THEN 'TANPA LANGGANAN — akan turun'
        WHEN s.expires_at IS NULL               THEN 'TANPA TANGGAL — akan turun'
        ELSE 'berakhir dalam '
             || GREATEST(0, EXTRACT(EPOCH FROM (s.expires_at - NOW())) / 86400)::int
             || ' hari'
    END AS keterangan
FROM public.profiles p
LEFT JOIN public.subscriptions s
       ON s.user_id = p.id AND s.status = 'active'
WHERE p.plan <> 'free'
ORDER BY s.expires_at NULLS FIRST;
