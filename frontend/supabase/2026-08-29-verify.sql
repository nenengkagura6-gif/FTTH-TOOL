-- ====================================================================
-- VERIFIKASI MIGRASI — 2026-08-29
-- Jalankan SELURUH file ini di Supabase SQL Editor setelah kedua
-- migrasi selesai. Read-only: tidak mengubah apa pun.
--
-- Setiap baris hasil punya kolom "status": OK atau GAGAL.
-- Semua harus OK.
-- ====================================================================

-- ====================================================================
-- Detail jadwal cron (statement pertama)
-- ====================================================================
-- CATATAN: Supabase SQL Editor hanya menampilkan hasil statement TERAKHIR.
-- Karena itu query ini sengaja ditaruh di depan, dan tabel 12 pemeriksaan
-- di bawah menjadi statement terakhir supaya hasilnya yang tampil.
-- Untuk melihat jadwal cron, blok query ini saja lalu tekan Run.
SELECT jobid, jobname, schedule, active
FROM cron.job
ORDER BY jobid;


-- ====================================================================
-- HASIL UTAMA — 12 pemeriksaan (semua kolom status harus OK)
-- ====================================================================
WITH checks AS (

    -- 1. Trigger pengunci kolom istimewa terpasang
    SELECT
        1 AS no,
        'Trigger guard profiles' AS pemeriksaan,
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'public.profiles'::regclass
              AND tgname = 'tr_protect_profile_privileged_columns'
              AND NOT tgisinternal
        ) THEN 'OK' ELSE 'GAGAL' END AS status,
        'Mencegah user mengubah plan/role/quota sendiri' AS keterangan

    -- 2. Bucket receipts privat
    UNION ALL SELECT
        2,
        'Bucket receipts privat',
        CASE WHEN EXISTS (
            SELECT 1 FROM storage.buckets WHERE id = 'receipts' AND public = false
        ) THEN 'OK' ELSE 'GAGAL' END,
        'Bukti transfer tidak bisa diakses publik'

    -- 3. Policy publik di receipts sudah hilang
    UNION ALL SELECT
        3,
        'Policy "Public read receipts" dihapus',
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'storage' AND tablename = 'objects'
              AND policyname = 'Public read receipts'
        ) THEN 'OK' ELSE 'GAGAL' END,
        'Anon tidak bisa lagi meng-enumerasi struk'

    -- 4. check_device_registration sekarang JSONB
    UNION ALL SELECT
        4,
        'check_device_registration -> jsonb',
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'check_device_registration'
              AND pg_get_function_result(p.oid) = 'jsonb'
        ) THEN 'OK' ELSE 'GAGAL' END,
        'Versi lama (boolean) sudah diganti'

    -- 5. reset_user_devices ada (tombol Reset Perangkat)
    UNION ALL SELECT
        5,
        'reset_user_devices ada',
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'reset_user_devices'
        ) THEN 'OK' ELSE 'GAGAL' END,
        'Tombol Reset Perangkat di dashboard berfungsi'

    -- 6. RLS aktif di device_registrations
    UNION ALL SELECT
        6,
        'RLS device_registrations aktif',
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'device_registrations'
              AND c.relrowsecurity
        ) THEN 'OK' ELSE 'GAGAL' END,
        'Tabel pendaftaran perangkat tidak lagi terbuka'

    -- 7. Fungsi yang ditangani migrasi punya search_path
    --    (dibatasi ke daftar yang memang disentuh; fungsi lama di luar
    --    lingkup migrasi ini sengaja tidak ikut dinilai)
    UNION ALL SELECT
        7,
        'search_path dipatok',
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.prosecdef
              AND p.proname IN (
                  'protect_profile_privileged_columns', 'increment_quota_usage',
                  'refresh_subscription_status', 'reset_monthly_quotas',
                  'check_device_registration', 'reset_user_devices',
                  'has_quota_remaining', 'reap_stuck_jobs', 'mark_expired_jobs'
              )
              AND (p.proconfig IS NULL
                   OR NOT EXISTS (
                       SELECT 1 FROM unnest(p.proconfig) cfg
                       WHERE cfg LIKE 'search_path=%'
                   ))
        ) THEN 'OK' ELSE 'GAGAL' END,
        'Cegah search_path hijacking di fungsi SECURITY DEFINER'

    -- 8. Kuota ditegakkan di RLS INSERT
    UNION ALL SELECT
        8,
        'Penegakan kuota di RLS',
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'processing_jobs'
              AND cmd = 'INSERT'
              AND with_check LIKE '%has_quota_remaining%'
        ) THEN 'OK' ELSE 'GAGAL' END,
        'User tidak bisa buat job saat kuota habis'

    -- 9. Policy UPDATE user sudah dicabut
    UNION ALL SELECT
        9,
        'Policy UPDATE job dicabut',
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'processing_jobs'
              AND cmd = 'UPDATE'
              AND 'authenticated' = ANY(roles::text[])
        ) THEN 'OK' ELSE 'GAGAL' END,
        'User tidak bisa memanipulasi status job'

    -- 10. Status 'expired' diizinkan constraint
    UNION ALL SELECT
        10,
        'Status expired diizinkan',
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.processing_jobs'::regclass
              AND conname = 'processing_jobs_status_check'
              AND pg_get_constraintdef(oid) LIKE '%expired%'
        ) THEN 'OK' ELSE 'GAGAL' END,
        'Cleanup tidak akan kena CHECK violation'

    -- 11. Tiga jadwal cron aktif
    UNION ALL SELECT
        11,
        'Jadwal pg_cron (butuh 3)',
        CASE WHEN (
            SELECT COUNT(*) FROM cron.job
            WHERE jobname IN ('mark-expired-jobs', 'reap-stuck-jobs', 'reset-monthly-quotas')
              AND active
        ) = 3 THEN 'OK' ELSE 'GAGAL' END,
        'mark-expired-jobs, reap-stuck-jobs, reset-monthly-quotas'

    -- 12. anon tidak bisa memanggil RPC sensitif
    UNION ALL SELECT
        12,
        'EXECUTE dicabut dari anon',
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('check_device_registration', 'reset_user_devices',
                                'refresh_subscription_status', 'get_admin_payments',
                                'increment_quota_usage', 'reset_monthly_quotas')
              AND has_function_privilege('anon', p.oid, 'EXECUTE')
        ) THEN 'OK' ELSE 'GAGAL' END,
        'Pengunjung belum login tidak bisa memanggil RPC ini'
)
SELECT no, pemeriksaan, status, keterangan
FROM checks
ORDER BY no;
