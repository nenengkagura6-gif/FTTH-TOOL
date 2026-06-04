import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlShpPage() {
  return (
    <ToolPage
      title="KML to Shapefile"
      description="Convert your KML/KMZ maps into ESRI Shapefiles (SHP) compatible with professional GIS systems like QGIS and ArcGIS."
      acceptedFormats={[".kml", ".kmz"]}
      processingNotes={[
        "Points, Polylines, and Polygons are automatically sorted.",
        "Generates separate shapefile layers (points.shp, lines.shp, polygons.shp) if present.",
        "Output is packaged in a downloadable ZIP archive containing .shp, .dbf, .shx, and .prj projection files.",
        "Uses standard WGS84 coordinate system (EPSG:4326).",
        "Free utility tool available to all users.",
      ]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      toolName="kml_to_shp"
    />
  )
}
