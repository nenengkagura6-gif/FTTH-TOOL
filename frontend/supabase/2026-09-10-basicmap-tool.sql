-- ====================================================================
-- TAMBAH TOOL 'basicmap' KE CHECK CONSTRAINT tool_name — 2026-09-10
-- Jalankan di Supabase Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- Tanpa migrasi ini, BasicMap gagal sebelum backend tersentuh:
--   new row for relation "processing_jobs" violates check constraint
--   "processing_jobs_tool_name_check"
--
-- Daftar di bawah = daftar 2026-08-30-tool-name-constraint.sql, ditambah
-- 'basicmap'. Ingat aturannya: menambah tool baru berarti menambahkannya
-- di DUA tempat — supported_tools di app/main.py dan di sini.
-- ====================================================================

ALTER TABLE public.processing_jobs
    DROP CONSTRAINT IF EXISTS processing_jobs_tool_name_check;

ALTER TABLE public.processing_jobs
    ADD CONSTRAINT processing_jobs_tool_name_check CHECK (tool_name IN (
        -- Diproses backend (app/main.py -> supported_tools)
        'kml_to_boq',
        'kml_to_database_hp',
        'kml_to_database',
        'kml_duplicate_checker',
        'kml_to_csv',
        'kml_to_shp',
        'shp_to_kml',
        'kml_to_dxf',
        'dxf_to_kml',
        'kml_extractor',
        'pole_sorter',
        'insert_coding',
        'kml_apd',
        'auto_placemark',
        'basicmap',           -- <-- baru

        -- Tool lama / sisi klien yang sudah pernah tercatat di riwayat
        'otdr_analyzer',
        'opm_calculator'
    ));


-- ====================================================================
-- VERIFIKASI — statement terakhir, hasilnya yang tampil
-- ====================================================================
SELECT
    pg_get_constraintdef(oid) LIKE '%basicmap%' AS basicmap_diizinkan,
    pg_get_constraintdef(oid) AS definisi
FROM pg_constraint
WHERE conname = 'processing_jobs_tool_name_check';
