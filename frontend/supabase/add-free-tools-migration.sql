-- =========================================================================
-- MIGRATION: ADD FREE CONVERSION TOOLS
-- Run this script in the Supabase SQL Editor (https://supabase.com)
-- =========================================================================

-- 1. Alter processing_jobs tool_name check constraint to allow new tools
ALTER TABLE public.processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_tool_name_check;

ALTER TABLE public.processing_jobs ADD CONSTRAINT processing_jobs_tool_name_check CHECK (tool_name IN (
    'kml_to_boq', 
    'kml_to_database', 
    'kml_duplicate_checker',
    'otdr_analyzer', 
    'opm_calculator',
    -- New Free Tools:
    'kml_to_csv', 
    'kml_to_shp', 
    'shp_to_kml'
));

-- 2. Update allowed mime types for 'uploads' bucket in Supabase Storage
-- This allows users to upload .zip shapefiles for Shapefile to KML conversion.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'application/vnd.google-earth.kml+xml',
    'application/vnd.google-earth.kmz',
    'application/xml',
    'text/xml',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
]
WHERE id = 'uploads';

-- =========================================================================
-- Done! Migration completed.
-- =========================================================================
