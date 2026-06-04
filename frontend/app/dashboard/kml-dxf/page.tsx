import { ToolPage } from "@/components/dashboard/tool-page"

export default function KmlDxfPage() {
  return (
    <ToolPage
      title="KML to AutoCAD (DXF)"
      description="Convert your Google Earth KML/KMZ maps into a 100% precise AutoCAD DXF drawing file, complete with layers, colors, and correct metric UTM projections."
      acceptedFormats={[".kml", ".kmz"]}
      processingNotes={[
        "Automatically projects spherical coordinates (Latitude/Longitude degrees) to flat metric coordinates (UTM meters) based on the center of your map.",
        "Maintains KML folder structures as standard AutoCAD layers (e.g., Tiang, Kabel, Area) with dedicated color mappings.",
        "Converts points to circular nodes and point nodes, paths to CAD polylines, and regions to closed polylines.",
        "Creates text nodes for labels placed adjacent to the corresponding elements.",
        "The generated DXF file is fully metric (1 unit = 1 meter) and compatible with all major CAD and GIS software (AutoCAD, QGIS, Global Mapper, etc.).",
        "Free utility tool available to all users.",
      ]}
      primaryAccept=".kml,.kmz"
      supportsExcelTemplate={false}
      toolName="kml_to_dxf"
    />
  )
}
