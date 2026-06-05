-- =========================================================================
-- MIGRATION: ADD KML/KMZ EXTRACTOR TOOL
-- Run this script in the Supabase SQL Editor (https://supabase.com)
-- =========================================================================

-- 1. Alter processing_jobs tool_name check constraint to allow kml_extractor
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
    'kml_to_dxf',
    'dxf_to_kml',
    -- New KML Extractor Tool:
    'kml_extractor'
));

-- =========================================================================
-- Done! Migration completed.
-- =========================================================================
