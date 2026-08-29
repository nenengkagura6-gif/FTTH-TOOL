-- ====================================================================
-- ALAT UJI: buktikan kedaluwarsa langganan benar-benar bekerja
--
-- Cara pakai:
--   1. Paste SELURUH file ini ke Supabase SQL Editor
--   2. Ganti email di baris paling bawah
--   3. Run
--
-- Semua tahap dijalankan dalam satu panggilan dan dilaporkan sekaligus,
-- jadi tidak ada risiko sebagian statement tidak ikut dieksekusi.
--
-- Bersifat merusak untuk akun yang diuji: plan-nya benar-benar diturunkan
-- ke 'free'. Kembalikan lewat dropdown admin di /admin setelah selesai.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.test_expiry_for(p_email TEXT)
RETURNS JSONB AS $fn$
DECLARE
    v_uid          UUID;
    v_plan_awal    TEXT;
    v_quota_awal   INTEGER;
    v_role         TEXT;
    v_subs_aktif   INTEGER;
    v_dimundurkan  INTEGER;
    v_hasil        JSONB;
    v_plan_akhir   TEXT;
    v_quota_akhir  INTEGER;
BEGIN
    -- Tahap 0: pastikan akunnya ada
    SELECT id, plan, quota_limit, COALESCE(role, 'user')
      INTO v_uid, v_plan_awal, v_quota_awal, v_role
      FROM public.profiles WHERE email = p_email;

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'GAGAL',
            'alasan', format('Tidak ada akun dengan email %L. Cek ejaannya.', p_email)
        );
    END IF;

    IF v_role = 'admin' THEN
        RETURN jsonb_build_object(
            'status', 'DILEWATI',
            'alasan', 'Akun ini admin — sengaja dikecualikan dari penurunan otomatis.',
            'email', p_email
        );
    END IF;

    IF v_plan_awal = 'free' THEN
        RETURN jsonb_build_object(
            'status', 'DILEWATI',
            'alasan', 'Akun sudah berpaket free; tidak ada yang bisa diturunkan.',
            'email', p_email
        );
    END IF;

    SELECT COUNT(*) INTO v_subs_aktif
      FROM public.subscriptions
     WHERE user_id = v_uid AND status = 'active';

    -- Tahap 1: mundurkan tanggal berakhir ke kemarin
    UPDATE public.subscriptions
       SET expires_at = NOW() - INTERVAL '1 day',
           updated_at = NOW()
     WHERE user_id = v_uid AND status = 'active';

    GET DIAGNOSTICS v_dimundurkan = ROW_COUNT;

    -- Tahap 2: jalankan mesin kedaluwarsa
    v_hasil := public.expire_due_subscriptions();

    -- Tahap 3: baca keadaan akhir
    SELECT plan, quota_limit INTO v_plan_akhir, v_quota_akhir
      FROM public.profiles WHERE id = v_uid;

    RETURN jsonb_build_object(
        'status', CASE WHEN v_plan_akhir = 'free' THEN 'LULUS' ELSE 'GAGAL' END,
        'email', p_email,
        'plan_sebelum', v_plan_awal,
        'plan_sesudah', v_plan_akhir,
        'quota_sebelum', v_quota_awal,
        'quota_sesudah', v_quota_akhir,
        'langganan_aktif_ditemukan', v_subs_aktif,
        'langganan_dimundurkan', v_dimundurkan,
        'laporan_mesin', v_hasil,
        'catatan', CASE
            WHEN v_plan_akhir = 'free'
                THEN 'Kedaluwarsa bekerja. Kembalikan ke pro lewat dropdown admin di /admin.'
            WHEN v_subs_aktif = 0
                THEN 'Akun ini tidak punya langganan aktif sama sekali — jalankan dulu 2026-08-29-subscription-expiry-fixup.sql'
            ELSE 'Plan tidak turun. Kirim seluruh hasil ini untuk ditelusuri.'
        END
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.test_expiry_for(TEXT) FROM PUBLIC, anon, authenticated;


-- ====================================================================
-- GANTI EMAIL DI BAWAH INI, LALU RUN
-- ====================================================================
SELECT jsonb_pretty(public.test_expiry_for('GANTI_DENGAN_EMAIL_AKUN_UJI')) AS hasil_uji;


-- ====================================================================
-- Setelah selesai menguji, alat ini boleh dibuang:
--   DROP FUNCTION IF EXISTS public.test_expiry_for(TEXT);
-- ====================================================================
