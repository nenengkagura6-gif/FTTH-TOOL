"use client"

import { ToolPage } from "@/components/dashboard/tool-page"
import JSZip from "jszip"

async function processKmlToCsvClient(file: File): Promise<{ blob: Blob; filename: string }> {
  let kmlText = ""
  
  if (file.name.toLowerCase().endsWith(".kmz")) {
    const zip = new JSZip()
    const loadedZip = await zip.loadAsync(file)
    const kmlFileKey = Object.keys(loadedZip.files).find((filename) => filename.toLowerCase().endsWith(".kml"))
    if (!kmlFileKey) {
      throw new Error("No KML file found inside the KMZ archive.")
    }
    kmlText = await loadedZip.files[kmlFileKey].async("string")
  } else {
    kmlText = await file.text()
  }

  // Clean namespace prefixes (similar to clean_xml_prefixes in backend)
  const cleanedText = kmlText.replace(new RegExp("<(/?)([\\w\\-]+):", "g"), '<$1')
  
  // Parse XML using browser DOMParser
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(cleanedText, "text/xml")
  
  // Robustly find all Placemark elements by check localName to handle namespaces if any prefix cleaning was missed
  const allElements = xmlDoc.getElementsByTagName("*")
  const placemarks: Element[] = []
  for (let i = 0; i < allElements.length; i++) {
    if (allElements[i].localName === "Placemark") {
      placemarks.push(allElements[i])
    }
  }

  const csvRows: string[][] = [["latitude", "longitude", "name"]]
  
  for (const pm of placemarks) {
    // Helper to get element by local name
    const getChildByLocalName = (parent: Element, localName: string): Element | null => {
      for (let i = 0; i < parent.children.length; i++) {
        if (parent.children[i].localName === localName) {
          return parent.children[i]
        }
      }
      // Recursive fallback
      const descendants = parent.getElementsByTagName("*")
      for (let i = 0; i < descendants.length; i++) {
        if (descendants[i].localName === localName) {
          return descendants[i]
        }
      }
      return null
    }

    const point = getChildByLocalName(pm, "Point")
    const nameElem = getChildByLocalName(pm, "name")
    const name = nameElem && nameElem.textContent ? nameElem.textContent.trim() : "No Name"
    
    if (point) {
      const coordElem = getChildByLocalName(point, "coordinates")
      if (coordElem && coordElem.textContent) {
        try {
          const parts = coordElem.textContent.trim().split(",")
          if (parts.length >= 2) {
            const lon = parseFloat(parts[0].trim())
            const lat = parseFloat(parts[1].trim())
            
            if (!isNaN(lat) && !isNaN(lon)) {
              csvRows.push([lat.toString(), lon.toString(), name])
            }
          }
        } catch (e) {
          // Skip invalid geometries
        }
      }
    }
  }

  // Generate CSV text safely escaping quotes
  const csvContent = csvRows
    .map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
    .join("\n")
    
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || "result"
  
  return {
    blob,
    filename: `${baseName}.csv`
  }
}

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
      toolName="kml_to_csv"
      clientProcessor={processKmlToCsvClient}
    />
  )
}
