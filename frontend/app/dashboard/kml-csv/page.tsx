import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlCsvPage() {
  return (
    <ToolPage
      title="KML to CSV"
      description="Extract point coordinates and names from your KML/KMZ files into a standard comma-separated values (CSV) spreadsheet."
      acceptedFormats={[".kml", ".kmz"]}
      processingNotes={[
        "Extracts Placemarks containing Point geometries.",
        "Generates a CSV with latitude, longitude, and name columns.",
        "Output CSV is formatted with commas for easy opening in Microsoft Excel.",
        "No subscription required. This is a free utility tool.",
      ]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
    />
  )
}
