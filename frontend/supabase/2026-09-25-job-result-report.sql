-- ====================================================================
-- LAPORAN HASIL PROSES PER JOB — 2026-09-25
-- Jalankan di Supabase Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- Setiap engine sekarang mengembalikan laporan berisi peringatan dan
-- statistik ringkas, misalnya:
--   {"warnings": ["3 HP dilewati karena ID FAT tidak ditemukan: ..."],
--    "stats": {"hp": 214, "fat": 18}}
-- Backend menyimpannya ke kolom ini, dan halaman tool menampilkannya di
-- bawah tombol unduh. Sebelumnya hasil yang tidak lengkap tetap tampil
-- sebagai "sukses" tanpa keterangan apa pun.
--
-- Backend tetap berjalan tanpa migrasi ini (update laporannya gagal
-- sendirian dan hanya dicatat di log), tetapi laporannya tidak tampil.
-- Kolom baru otomatis ikut policy SELECT milik user yang sudah ada.
-- ====================================================================

ALTER TABLE public.processing_jobs
    ADD COLUMN IF NOT EXISTS result_report JSONB;

COMMENT ON COLUMN public.processing_jobs.result_report IS
    'Laporan engine: {"warnings": [..], "stats": {..}}. Diisi backend saat job selesai.';


-- ====================================================================
-- VERIFIKASI — statement terakhir, hasilnya yang tampil
-- ====================================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'processing_jobs'
  AND column_name = 'result_report';
