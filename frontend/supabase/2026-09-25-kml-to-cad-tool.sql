-- ====================================================================
-- TAMBAH TOOL 'kml_to_cad' KE CHECK CONSTRAINT tool_name — 2026-09-25
-- Jalankan di Supabase Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- Tanpa migrasi ini, KML to CAD gagal sebelum backend tersentuh:
--   new row for relation "processing_jobs" violates check constraint
--   "processing_jobs_tool_name_check"
--
-- Daftar di bawah = daftar 2026-09-10-basicmap-tool.sql, ditambah
-- 'kml_to_cad'. Ingat aturannya: menambah tool baru berarti menambahkannya
-- di DUA tempat — SUPPORTED_TOOLS di app/main.py dan di sini.
-- ====================================================================

ALTER TABLE public.processing_jobs
    DROP CONSTRAINT IF EXISTS processing_jobs_tool_name_check;

ALTER TABLE public.processing_jobs
    ADD CONSTRAINT processing_jobs_tool_name_check CHECK (tool_name IN (
        -- Diproses backend (app/main.py -> SUPPORTED_TOOLS)
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
        'basicmap',
        'kml_to_cad',         -- <-- baru

        -- Tool lama / sisi klien yang sudah pernah tercatat di riwayat
        'otdr_analyzer',
        'opm_calculator'
    ));


-- ====================================================================
-- VERIFIKASI — statement terakhir, hasilnya yang tampil
-- ====================================================================
SELECT
    pg_get_constraintdef(oid) LIKE '%kml_to_cad%' AS kml_to_cad_diizinkan,
    pg_get_constraintdef(oid) AS definisi
FROM pg_constraint
WHERE conname = 'processing_jobs_tool_name_check';
