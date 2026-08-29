-- ====================================================================
-- PERBAIKAN KEDALUWARSA LANGGANAN — 2026-08-29
-- Jalankan SETELAH 2026-08-29-security-hardening.sql
-- Idempotent: aman dijalankan berulang kali.
--
-- Gejala: akun yang dijadikan 'pro' tidak pernah turun ke 'free'.
--
-- Ada TIGA sebab yang menumpuk:
--
--   A. refresh_subscription_status() menulis status = 'expired' ke tabel
--      subscriptions, padahal CHECK constraint-nya hanya mengizinkan
--      active/paused/cancelled/past_due/trialing. Setiap kali ada yang
--      harus dikedaluwarsakan, fungsi melempar CHECK violation dan
--      PostgreSQL me-rollback SELURUH transaksi — termasuk penurunan
--      plan yang sudah dijalankan di baris sebelumnya. Error-nya ditelan
--      console.error di frontend, jadi tidak pernah terlihat.
--
--   B. Dropdown plan di panel admin hanya menulis profiles.plan tanpa
--      membuat baris subscriptions. Tanpa baris itu tidak ada tanggal
--      kedaluwarsa sama sekali, dan syarat EXISTS(...) pada fungsi lama
--      tidak pernah terpenuhi.
--
--   C. Pengecekan hanya berjalan di sisi klien saat user login. Tidak ada
--      proses global, sehingga panel admin menampilkan status yang sudah
--      basi untuk user yang lama tidak membuka aplikasi.
-- ====================================================================


-- ====================================================================
-- BAGIAN 1 — IZINKAN STATUS 'expired' (memperbaiki sebab A)
-- ====================================================================

ALTER TABLE public.subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check CHECK (status IN (
        'active',
        'paused',
        'cancelled',
        'past_due',
        'trialing',
        'expired'
    ));


-- ====================================================================
-- BAGIAN 2 — BACKFILL: BERI JANGKAR PADA PLAN BERBAYAR YANG TELANJANG
-- ====================================================================
-- Sengaja TIDAK langsung menurunkan siapa pun. Akun berbayar yang saat ini
-- tidak punya langganan (karena diset lewat dropdown admin) diberi masa
-- aktif 30 hari ke depan, supaya mulai sekarang punya tanggal kedaluwarsa
-- yang nyata alih-alih hilang mendadak.
--
-- Akun dengan role admin dilewati: operator tidak boleh diturunkan sistem.

INSERT INTO public.subscriptions (
    user_id, plan, status, billing_cycle,
    started_at, expires_at, payment_provider, metadata
)
SELECT
    p.id,
    p.plan,
    'active',
    'monthly',
    NOW(),
    NOW() + INTERVAL '30 days',
    'manual',
    jsonb_build_object('source', 'backfill_2026_08_29')
FROM public.profiles p
WHERE p.plan <> 'free'
  AND COALESCE(p.role, 'user') <> 'admin'
  AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = p.id
        AND s.status = 'active'
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
  );


-- ====================================================================
-- BAGIAN 3 — MESIN KEDALUWARSA GLOBAL (memperbaiki sebab B & C)
-- ====================================================================
-- Berlaku untuk SEMUA user, bukan hanya yang sedang login. Aturannya
-- diperketat: plan berbayar TANPA langganan aktif akan diturunkan —
-- bukan hanya yang langganannya kebetulan sudah lewat tanggal. Dengan
-- begitu, plan yang diset manual tanpa langganan tidak lagi abadi.

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

    -- 1. Tandai langganan yang sudah lewat tanggal
    UPDATE public.subscriptions
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at < NOW();

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
            AND (s.expires_at IS NULL OR s.expires_at > NOW())
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
-- BAGIAN 4 — VERSI PER-USER (dipanggil frontend saat login)
-- ====================================================================
-- Memberi efek langsung begitu user membuka aplikasi, tanpa menunggu cron.
-- Urutannya dibalik dari versi lama: langganan ditandai kedaluwarsa LEBIH
-- DULU, baru plan diturunkan — supaya kalau salah satu gagal, keadaannya
-- tetap konsisten.

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

    -- 1. Tandai langganan sendiri yang sudah lewat tanggal
    UPDATE public.subscriptions
    SET status = 'expired',
        updated_at = NOW()
    WHERE user_id = v_uid
      AND status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at < NOW();

    -- 2. Turunkan plan kalau tidak lagi punya langganan aktif
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
            AND (s.expires_at IS NULL OR s.expires_at > NOW())
      );

    PERFORM set_config('app.profile_guard_bypass', 'off', true);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.refresh_subscription_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.refresh_subscription_status() TO authenticated;


-- ====================================================================
-- BAGIAN 5 — JADWALKAN TIAP JAM
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $do$
BEGIN
    PERFORM cron.unschedule('expire-due-subscriptions');
EXCEPTION WHEN OTHERS THEN NULL;
END
$do$;

SELECT cron.schedule(
    'expire-due-subscriptions',
    '23 * * * *',
    $cron$ SELECT public.expire_due_subscriptions(); $cron$
);


-- ====================================================================
-- VERIFIKASI & CARA MENGUJI
-- ====================================================================
-- 1. Constraint sudah menerima 'expired':
--      SELECT pg_get_constraintdef(oid) FROM pg_constraint
--      WHERE conname = 'subscriptions_status_check';
--
-- 2. Lihat semua akun berbayar dan tanggal berakhirnya:
--      SELECT p.email, p.plan, s.status, s.expires_at
--      FROM public.profiles p
--      LEFT JOIN public.subscriptions s
--             ON s.user_id = p.id AND s.status = 'active'
--      WHERE p.plan <> 'free'
--      ORDER BY s.expires_at NULLS FIRST;
--      -> setiap akun berbayar non-admin harus punya expires_at
--
-- 3. UJI KEDALUWARSA tanpa menunggu 30 hari — ganti <EMAIL> dengan
--    akun uji Anda, lalu jalankan tiga langkah ini berurutan:
--
--      -- a) mundurkan tanggal berakhirnya ke kemarin
--      UPDATE public.subscriptions s
--      SET expires_at = NOW() - INTERVAL '1 day'
--      FROM public.profiles p
--      WHERE p.id = s.user_id AND p.email = '<EMAIL>' AND s.status = 'active';
--
--      -- b) jalankan mesin kedaluwarsa
--      SELECT public.expire_due_subscriptions();
--
--      -- c) pastikan sudah turun
--      SELECT email, plan, quota_limit FROM public.profiles WHERE email = '<EMAIL>';
--      -> plan harus 'free'
--
-- 4. Jadwal cron terpasang:
--      SELECT jobname, schedule, active FROM cron.job ORDER BY jobid;
-- ====================================================================
