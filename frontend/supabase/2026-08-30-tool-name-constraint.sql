-- ====================================================================
-- CHECK CONSTRAINT tool_name DISELARASKAN — 2026-08-30
-- Jalankan di Supabase Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- Gejala: Auto Tagging HP gagal dengan
--   new row for relation "processing_jobs" violates check constraint
--   "processing_jobs_tool_name_check"
--
-- Sebab: backend sudah mendukung 'auto_placemark' (ada di supported_tools
-- pada app/main.py), tetapi daftar di CHECK constraint tidak pernah
-- ditambahi. Setiap tool sebelumnya punya migrasi sendiri —
-- add-pole-sorter-tool.sql, add-kml-apd-tool.sql, dan seterusnya — dan
-- yang satu ini terlewat.
--
-- Daftar di bawah disamakan dengan supported_tools milik backend, plus
-- tool lama yang sudah pernah tercatat di riwayat job. Menambah tool baru
-- ke depannya berarti menambahkannya di DUA tempat: app/main.py dan sini.
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
        'auto_placemark',     -- <-- yang hilang sebelumnya

        -- Tool lama / sisi klien yang sudah pernah tercatat di riwayat
        'otdr_analyzer',
        'opm_calculator'
    ));


-- ====================================================================
-- VERIFIKASI — statement terakhir, hasilnya yang tampil
-- ====================================================================
SELECT
    ('auto_placemark' = ANY (
        string_to_array(
            replace(replace(substring(pg_get_constraintdef(oid)
                            from '\(([^)]*)\)$'), '''', ''), ' ', ''),
            ','
        )
    )) AS auto_placemark_diizinkan,
    pg_get_constraintdef(oid) AS definisi
FROM pg_constraint
WHERE conname = 'processing_jobs_tool_name_check';
