import React from "react"
import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlCheckerPage() {
  return (
    <ToolPage
      title="KML Duplicate Checker"
      description="Detect duplicate HP and pole points across your KML files before they ship. Get a clean diff report with exact coordinates and recommended actions."
      acceptedFormats={[".kml", ".kmz"]}
      processingNotes={[
        "Default proximity threshold is 3m — adjustable via the optional template.",
        "Duplicates across multiple files in a single upload are also detected.",
        "Output includes both a deduplicated KML and a CSV mismatch report.",
        "Supports up to 200,000 placemarks per run.",
      ]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      featureKey="kml_duplicate_checker"
    />
  )
}
