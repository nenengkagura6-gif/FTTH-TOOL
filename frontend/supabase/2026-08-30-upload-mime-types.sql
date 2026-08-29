-- ====================================================================
-- PERLUAS TIPE FILE YANG BOLEH DIUNGGAH — 2026-08-30
-- Jalankan di Supabase Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- Masalah: halaman Auto Placemark menawarkan .geojson dan .json
--
--     acceptedFormats={[".kml", ".kmz", ".geojson", ".json"]}
--
-- tetapi bucket 'uploads' TIDAK mengizinkan MIME application/json maupun
-- application/geo+json. Unggahannya ditolak Supabase Storage sebelum
-- backend tersentuh sama sekali — user hanya melihat error mentah.
--
-- Tipe DXF juga ditambahkan: halaman DXF→KML menerima .dxf, dan sebagian
-- browser mengirimkannya sebagai image/vnd.dxf, bukan
-- application/octet-stream.
-- ====================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    -- KML / KMZ
    'application/vnd.google-earth.kml+xml',
    'application/vnd.google-earth.kmz',
    'application/xml',
    'text/xml',
    -- GeoJSON (dipakai Auto Placemark)
    'application/geo+json',
    'application/json',
    'text/json',
    -- Excel (template BOQ / APD)
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    -- CSV
    'text/csv',
    'text/plain',
    -- Shapefile & arsip
    'application/zip',
    'application/x-zip-compressed',
    -- AutoCAD DXF
    'image/vnd.dxf',
    'application/dxf',
    'application/x-dxf',
    -- Penampung terakhir: banyak browser mengirim ini untuk ekstensi
    -- yang tidak dikenalinya
    'application/octet-stream'
]
WHERE id = 'uploads';


-- ====================================================================
-- VERIFIKASI — statement terakhir, hasilnya yang tampil
-- ====================================================================
SELECT
    id AS bucket,
    public,
    pg_size_pretty(file_size_limit::bigint) AS batas_ukuran,
    array_length(allowed_mime_types, 1) AS jumlah_mime,
    ('application/geo+json' = ANY(allowed_mime_types)) AS geojson_diizinkan,
    ('application/json'     = ANY(allowed_mime_types)) AS json_diizinkan,
    ('image/vnd.dxf'        = ANY(allowed_mime_types)) AS dxf_diizinkan
FROM storage.buckets
WHERE id IN ('uploads', 'outputs', 'receipts')
ORDER BY id;
