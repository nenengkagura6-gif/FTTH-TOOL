import { ToolPage } from "@/components/dashboard/tool-page"

export default function ShpKmlPage() {
  return (
    <ToolPage
      title="Shapefile to KML"
      description="Convert your ESRI Shapefile archives back into Google Earth KML format for easy visualization."
      acceptedFormats={[".zip"]}
      processingNotes={[
        "Upload a ZIP archive containing at least the .shp and .dbf files of your shapefile.",
        "Reads point, polyline, and polygon geometries and builds corresponding KML Placemarks.",
        "Auto-detects labels or names from shapefile attribute tables.",
        "Free utility tool available to all users.",
      ]}
      primaryAccept=".zip"
      supportsExcelTemplate={false}
      toolName="shp_to_kml"
    />
  )
}
