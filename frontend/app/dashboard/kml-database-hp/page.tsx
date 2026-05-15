import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlDatabaseHpPage() {
  return (
    <ToolPage
      title="KML to Database HP"
      description="Convert KML homepass data into a structured, normalized database. Consistent IDs, validated coordinates, and ready-to-import CSV/XLSX output."
      acceptedFormats={[".kml", ".kmz", ".xlsx"]}
      processingNotes={[
        "HP IDs are auto-generated using your cluster prefix and sequence rules.",
        "Duplicate coordinates within a 5m radius are flagged for review.",
        "Custom fields can be mapped through the optional Excel template.",
        "Output is delivered as XLSX and CSV bundled together.",
      ]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate
      featureKey="kml_to_database"
    />
  )
}
