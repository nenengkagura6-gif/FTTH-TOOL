-- =========================================================================
-- MIGRATION: ADD KML TO AUTOCAD (DXF) CONVERSION TOOL
-- Run this script in the Supabase SQL Editor (https://supabase.com)
-- =========================================================================

-- 1. Alter processing_jobs tool_name check constraint to allow kml_to_dxf
ALTER TABLE public.processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_tool_name_check;

ALTER TABLE public.processing_jobs ADD CONSTRAINT processing_jobs_tool_name_check CHECK (tool_name IN (
    'kml_to_boq', 
    'kml_to_database', 
    'kml_duplicate_checker',
    'otdr_analyzer', 
    'opm_calculator',
    'kml_to_csv', 
    'kml_to_shp', 
    'shp_to_kml',
    -- New KML to DXF Tool:
    'kml_to_dxf'
));

-- =========================================================================
-- Done! Migration completed.
-- =========================================================================
