import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlBoqPage() {
  return (
    <ToolPage
      title="KML to BOQ"
      description="Generate a Bill of Quantities directly from your KML/KMZ files. Cable lengths, splitters, poles, and accessories tallied automatically."
      acceptedFormats={[".kml", ".kmz", ".xlsx"]}
      processingNotes={[
        "Cable lengths are calculated using Haversine distance between LineString points.",
        "Splitter and pole counts are derived from Placemark icons or named styles.",
        "Use the optional Excel template to override default rates and units.",
        "Files larger than 50MB should be split into clusters before upload.",
      ]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate
      featureKey="kml_to_boq"
    />
  )
}
