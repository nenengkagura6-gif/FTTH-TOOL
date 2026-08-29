-- ====================================================================
-- QUOTA ENFORCEMENT + FILE RETENTION — 2026-08-29
-- Jalankan SETELAH 2026-08-29-security-hardening.sql
-- Idempotent: aman dijalankan berulang kali.
--
-- Memperbaiki:
--   1. Kuota ditampilkan di UI tapi tidak pernah ditegakkan (user free
--      bisa memproses tanpa batas)
--   2. User bisa meng-UPDATE baris job miliknya sendiri, termasuk status
--   3. Cleanup retensi 7 hari hanya ada sebagai task Celery yang tidak
--      pernah dideploy — file upload & output tidak pernah dihapus
--   4. Job yang mati di tengah jalan macet di status 'processing' selamanya
-- ====================================================================


-- ====================================================================
-- BAGIAN 1 — PENEGAKAN KUOTA DI LEVEL DATABASE
-- ====================================================================
-- Ditegakkan lewat RLS, bukan di frontend, supaya tidak bisa dilewati
-- dengan memanggil PostgREST langsung.

CREATE OR REPLACE FUNCTION public.has_quota_remaining(p_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        (SELECT quota_used < quota_limit
         FROM public.profiles
         WHERE id = p_user_id AND is_active = true),
        false
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.has_quota_remaining(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_quota_remaining(UUID) TO authenticated;

-- Job baru hanya boleh dibuat jika kuota masih tersisa
DROP POLICY IF EXISTS "Users can create own jobs" ON public.processing_jobs;
CREATE POLICY "Users can create own jobs"
    ON public.processing_jobs FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND public.has_quota_remaining(auth.uid())
    );


-- ====================================================================
-- BAGIAN 2 — USER TIDAK BOLEH LAGI MENG-UPDATE BARIS JOB
-- ====================================================================
-- Policy lama "Users can update own jobs" mengizinkan user mengubah
-- status, output_file_url, dan progress job-nya sendiri. Frontend tidak
-- pernah memakainya (hanya INSERT + SELECT) — yang menulis progres adalah
-- backend memakai service role, yang punya policy sendiri.
--
-- Dibiarkan terbuka, user bisa memanipulasi status untuk menghindari
-- pertambahan kuota.

DROP POLICY IF EXISTS "Users can update own jobs" ON public.processing_jobs;


-- ====================================================================
-- BAGIAN 3 — REAPER UNTUK JOB YANG MACET
-- ====================================================================
-- Instance Render/HF free tier tidur setelah idle. BackgroundTask yang
-- terbunuh di tengah jalan meninggalkan job di status 'processing'
-- selamanya, dan UI terus melakukan polling sampai timeout.

CREATE OR REPLACE FUNCTION public.reap_stuck_jobs()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.processing_jobs
    SET status = 'failed',
        error_message = 'Proses terhenti di server (timeout). Silakan coba lagi.',
        completed_at = NOW(),
        expires_at = NOW() + INTERVAL '1 day',
        progress_percent = 0,
        progress_message = 'Gagal: proses terhenti'
    WHERE status IN ('queued', 'processing')
      AND created_at < NOW() - INTERVAL '30 minutes';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.reap_stuck_jobs() FROM PUBLIC, anon, authenticated;


-- ====================================================================
-- BAGIAN 3b — TAMBAHKAN STATUS 'expired' KE CHECK CONSTRAINT
-- ====================================================================
-- CHECK constraint processing_jobs.status di 01-schema.sql hanya
-- mengizinkan: pending, queued, processing, completed, failed, cancelled.
--
-- Nilai 'expired' tidak pernah masuk daftar, padahal mark_jobs_expired()
-- di app/supabase_client.py sudah menulisnya sejak lama. Bug ini belum
-- pernah terlihat karena cleanup Celery tidak pernah dijalankan — begitu
-- cleanup di Bagian 4 aktif, setiap eksekusi akan gagal dengan
-- CHECK violation tanpa perbaikan ini.

ALTER TABLE public.processing_jobs
    DROP CONSTRAINT IF EXISTS processing_jobs_status_check;

ALTER TABLE public.processing_jobs
    ADD CONSTRAINT processing_jobs_status_check CHECK (status IN (
        'pending',
        'queued',
        'processing',
        'completed',
        'failed',
        'cancelled',
        'expired'
    ));


-- ====================================================================
-- BAGIAN 4 — PENANDA JOB KEDALUWARSA (bukan penghapus file)
-- ====================================================================
-- PENTING — kenapa penghapusan file TIDAK dilakukan di SQL:
--
-- Menghapus baris dari storage.objects hanya membuang catatan database-
-- nya. Byte file yang sebenarnya tetap tersimpan di S3 sebagai objek
-- yatim, jadi kuota storage TIDAK ikut bebas — justru jadi lebih buruk,
-- karena file itu hilang dari listing dan tidak bisa dihapus lagi.
--
-- Penghapusan file yang benar harus lewat Storage API. Backend sudah
-- punya delete_storage_files() di app/supabase_client.py yang memakai
-- service role dan melakukannya dengan benar; endpoint
-- /api/v1/maintenance/cleanup memanggilnya.
--
-- Fungsi di bawah ini hanya jaring pengaman: menandai job kedaluwarsa
-- supaya tidak lagi bisa diunduh, walaupun cron backend sedang mati.
-- Kolom URL sengaja TIDAK dikosongkan supaya backend masih tahu file
-- mana yang harus dihapus.

CREATE OR REPLACE FUNCTION public.mark_expired_jobs()
RETURNS INTEGER AS $fn$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.processing_jobs
    SET status = 'expired',
        error_message = 'Masa simpan file sudah lewat. File dijadwalkan untuk dihapus.'
    WHERE expires_at < NOW()
      AND status IN ('completed', 'failed', 'cancelled');

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.mark_expired_jobs() FROM PUBLIC, anon, authenticated;


-- ====================================================================
-- BAGIAN 5 — JADWALKAN DENGAN pg_cron
-- ====================================================================
-- pg_cron tersedia di Supabase free tier dan menangani semua pekerjaan
-- yang murni database. Penghapusan file fisik dijadwalkan terpisah lewat
-- endpoint backend (lihat catatan di bawah).
--
-- Kalau extension gagal dibuat, aktifkan manual di:
-- Database > Extensions > pg_cron, lalu jalankan ulang bagian ini saja.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Bersihkan jadwal lama supaya tidak dobel saat file dijalankan ulang
DO $do$
DECLARE
    j TEXT;
BEGIN
    FOREACH j IN ARRAY ARRAY['cleanup-expired-jobs', 'mark-expired-jobs',
                             'reap-stuck-jobs', 'reset-monthly-quotas']
    LOOP
        BEGIN
            PERFORM cron.unschedule(j);
            RAISE NOTICE 'Jadwal lama dihapus: %', j;
        EXCEPTION WHEN OTHERS THEN
            NULL;  -- belum ada, lewati
        END;
    END LOOP;
END
$do$;

-- Setiap jam — tandai job yang sudah lewat masa simpan
SELECT cron.schedule(
    'mark-expired-jobs',
    '7 * * * *',
    $cron$ SELECT public.mark_expired_jobs(); $cron$
);

-- Setiap 15 menit — bereskan job yang macet di 'queued'/'processing'
SELECT cron.schedule(
    'reap-stuck-jobs',
    '*/15 * * * *',
    $cron$ SELECT public.reap_stuck_jobs(); $cron$
);

-- Setiap hari 02:00 UTC — reset kuota bulanan
SELECT cron.schedule(
    'reset-monthly-quotas',
    '0 2 * * *',
    $cron$ SELECT public.reset_monthly_quotas(); $cron$
);


-- ====================================================================
-- LANGKAH TERAKHIR — DI LUAR SQL
-- ====================================================================
-- Penghapusan file fisik dilakukan oleh backend, bukan di sini:
--
--   POST https://<backend-anda>/api/v1/maintenance/cleanup
--   Header: X-Maintenance-Token: <isi env MAINTENANCE_TOKEN>
--
-- Jadwalkan sekali sehari dengan penjadwal gratis apa pun — GitHub
-- Actions cron, cron-job.org, atau Cloudflare Worker cron. Contoh
-- workflow GitHub Actions ada di komentar app/main.py pada endpoint
-- tersebut.
--
-- Selama itu belum dipasang, file tetap menumpuk di storage — tapi job
-- kedaluwarsa sudah tidak bisa diunduh lagi berkat Bagian 4.


-- ====================================================================
-- VERIFIKASI
-- ====================================================================
-- 1. Jadwal cron terpasang:
--      SELECT jobname, schedule, active FROM cron.job;
--
-- 2. Uji penanda kedaluwarsa (aman — hanya menyentuh job yang sudah lewat
--    expires_at):
--      SELECT public.mark_expired_jobs();
--
--    Penghapusan file fisik diuji lewat backend:
--      curl -X POST https://<backend>/api/v1/maintenance/cleanup \
--           -H "X-Maintenance-Token: <MAINTENANCE_TOKEN>"
--
-- 3. Uji penegakan kuota: set kuota user sampai penuh, lalu dari console
--    browser sebagai user tsb:
--      await supabase.from('processing_jobs').insert({ ... })
--      -> harus gagal dengan error RLS (new row violates row-level security)
--
-- 4. Pastikan policy UPDATE user sudah hilang:
--      SELECT policyname, cmd FROM pg_policies
--      WHERE tablename = 'processing_jobs';
--      -> tidak boleh ada UPDATE untuk role authenticated
-- ====================================================================
