"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  MapPin,
  Upload,
  FileText,
  X,
  Compass,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Navigation,
  Info,
  Sliders,
  Settings,
  ListOrdered
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getSupabaseClient } from "@/lib/supabase/client"

interface Coordinate {
  lat: number
  lng: number
}

interface Path {
  name: string
  coords: Coordinate[]
}

interface KmlPoint {
  name: string
  lat: number
  lng: number
}

interface ApiResponseGeometries {
  status: string
  message?: string
  paths: Path[]
  points: KmlPoint[]
}

// Haversine formula to compute distance in meters between two points
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dphi = ((lat2 - lat1) * Math.PI) / 180
  const dlambda = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(dphi / 2) * Math.sin(dphi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) * Math.sin(dlambda / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

export default function OtdrFaultLocatorPage() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  // Geometries data
  const [paths, setPaths] = useState<Path[]>([])
  const [points, setPoints] = useState<KmlPoint[]>([])
  const [selectedPathIndex, setSelectedPathIndex] = useState<number>(0)

  // Calculations states
  const [faultDistance, setFaultDistance] = useState<number>(500) // in meters
  const [distanceUnit, setDistanceUnit] = useState<"m" | "km">("m")
  const [slackFactor, setSlackFactor] = useState<number>(0.97) // default 0.97 (fiber distance to map distance ratio)
  
  // Leaflet loading state
  const [isMapScriptLoaded, setIsMapScriptLoaded] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [copied, setCopied] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load Leaflet dynamically on mount
  useEffect(() => {
    // Check if Leaflet script is already appended
    if ((window as any).L) {
      setIsMapScriptLoaded(true)
      return
    }

    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    document.head.appendChild(link)

    const script = document.createElement("script")
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    script.async = true
    script.onload = () => {
      setIsMapScriptLoaded(true)
    }
    document.head.appendChild(script)

    return () => {
      // Keep Leaflet in DOM once loaded
    }
  }, [])

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUpload(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUpload(e.target.files[0])
    }
  }

  const processUpload = async (selectedFile: File) => {
    const ext = selectedFile.name.split(".").pop()?.toLowerCase()
    if (ext !== "kml" && ext !== "kmz") {
      setStatus("error")
      setErrorMsg("Berkas tidak valid. Harap unggah berkas .kml atau .kmz")
      return
    }

    setFile(selectedFile)
    setStatus("uploading")
    setErrorMsg(null)

    try {
      const formData = new FormData()
      formData.append("kml_file", selectedFile)

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiBaseUrl}/api/v1/kml/extract-path`, {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.detail || "Gagal mengurai koordinat rute KML/KMZ")
      }

      const data: ApiResponseGeometries = await res.json()
      if (data.status === "error") {
        throw new Error(data.message || "Gagal memproses berkas KML")
      }

      if (data.paths.length === 0) {
        throw new Error("Tidak ditemukan jalur rute kabel (LineString) dalam file KML/KMZ ini")
      }

      setPaths(data.paths)
      setPoints(data.points || [])
      setSelectedPathIndex(0)
      setStatus("success")
      
      // Auto-set fault distance to halfway along the path
      const totalLen = calculatePathLength(data.paths[0].coords)
      setFaultDistance(Math.round(totalLen * 0.5))
    } catch (err: any) {
      console.error(err)
      setStatus("error")
      setErrorMsg(err.message || "Terjadi kesalahan saat memproses data.")
    }
  }

  const handleReset = () => {
    setFile(null)
    setPaths([])
    setPoints([])
    setStatus("idle")
    setErrorMsg(null)
    setFaultDistance(500)
    setSelectedPathIndex(0)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }
  }

  // Calculate total path distance (cumulative along points)
  const calculatePathLength = (coords: Coordinate[]): number => {
    let totalDist = 0
    for (let i = 0; i < coords.length - 1; i++) {
      totalDist += calculateHaversineDistance(
        coords[i].lat,
        coords[i].lng,
        coords[i + 1].lat,
        coords[i + 1].lng
      )
    }
    return totalDist
  }

  const activePath = useMemo(() => {
    return paths[selectedPathIndex] || null
  }, [paths, selectedPathIndex])

  // Cumulative distances along path vertices
  const pathDistances = useMemo(() => {
    if (!activePath) return []
    const coords = activePath.coords
    const dists = [0]
    let currentTotal = 0
    for (let i = 0; i < coords.length - 1; i++) {
      const step = calculateHaversineDistance(
        coords[i].lat,
        coords[i].lng,
        coords[i + 1].lat,
        coords[i + 1].lng
      )
      currentTotal += step
      dists.push(currentTotal)
    }
    return dists
  }, [activePath])

  const totalPathLengthGeo = useMemo(() => {
    if (pathDistances.length === 0) return 0
    return pathDistances[pathDistances.length - 1]
  }, [pathDistances])

  // Fiber distance (estimated based on slack factor)
  // Fiber Distance = Geo Distance / Slack Factor
  // Map target distance (geographical) = OTDR Distance * Slack Factor
  const targetGeoDistance = useMemo(() => {
    const inputMeters = distanceUnit === "km" ? faultDistance * 1000 : faultDistance
    return inputMeters * slackFactor
  }, [faultDistance, distanceUnit, slackFactor])

  // Calculated fault coordinate
  const estimatedFault = useMemo((): (Coordinate & { isOut: boolean }) | null => {
    if (!activePath || pathDistances.length === 0) return null
    const coords = activePath.coords
    const target = targetGeoDistance

    if (target <= 0) {
      return { ...coords[0], isOut: false }
    }

    if (target >= totalPathLengthGeo) {
      return { ...coords[coords.length - 1], isOut: true }
    }

    // Interpolate
    for (let i = 0; i < pathDistances.length - 1; i++) {
      const d1 = pathDistances[i]
      const d2 = pathDistances[i + 1]
      if (target >= d1 && target <= d2) {
        const segLen = d2 - d1
        const t = segLen > 0 ? (target - d1) / segLen : 0
        const lat = coords[i].lat + t * (coords[i + 1].lat - coords[i].lat)
        const lng = coords[i].lng + t * (coords[i + 1].lng - coords[i].lng)
        return { lat, lng, isOut: false }
      }
    }

    return null
  }, [activePath, pathDistances, targetGeoDistance, totalPathLengthGeo])

  // Find closest pole/point
  const closestPointResult = useMemo(() => {
    if (!estimatedFault || points.length === 0) return null

    let minDistance = Infinity
    let closestPt: KmlPoint | null = null

    for (const pt of points) {
      const dist = calculateHaversineDistance(
        estimatedFault.lat,
        estimatedFault.lng,
        pt.lat,
        pt.lng
      )
      if (dist < minDistance) {
        minDistance = dist
        closestPt = pt
      }
    }

    return closestPt ? { point: closestPt, distance: minDistance } : null
  }, [estimatedFault, points])

  // copy coordinate
  const copyToClipboard = () => {
    if (!estimatedFault) return
    const text = `${estimatedFault.lat.toFixed(6)}, ${estimatedFault.lng.toFixed(6)}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Leaflet Map rendering hook
  useEffect(() => {
    if (!isMapScriptLoaded || !mapContainerRef.current || !activePath) return

    const L = (window as any).L
    if (!L) return

    // Recreate map container if it already exists
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
    }

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      fadeAnimation: true
    }).setView([activePath.coords[0].lat, activePath.coords[0].lng], 15)
    
    mapInstanceRef.current = map

    // CartoDB Dark Matter tiles (looks extremely clean for dark mode)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map)

    // Render path polyline
    const latLngs = activePath.coords.map((c) => [c.lat, c.lng])
    const polyline = L.polyline(latLngs, {
      color: "#06b6d4", // Cyan
      weight: 4,
      opacity: 0.85,
    }).addTo(map)

    // Fit boundary
    map.fitBounds(polyline.getBounds(), { padding: [30, 30] })

    // Add normal points (poles, joint closure etc.)
    points.forEach((pt) => {
      L.circleMarker([pt.lat, pt.lng], {
        radius: 4,
        fillColor: "#fbbf24", // Amber
        color: "#1e293b",
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.9,
      })
        .addTo(map)
        .bindTooltip(pt.name, {
          direction: "top",
          className: "leaflet-tooltip-dark bg-neutral-900 border-neutral-800 text-white font-mono text-[10px] px-2 py-0.5 rounded shadow-lg",
        })
    })

    // Fault marker
    let faultCircle: any = null
    let faultPulseCircle: any = null

    if (estimatedFault) {
      const faultLatLng = [estimatedFault.lat, estimatedFault.lng]

      // Draw red pulsing circle for fault
      faultPulseCircle = L.circle(faultLatLng, {
        radius: 40,
        fillColor: "#ef4444",
        color: "transparent",
        weight: 0,
        fillOpacity: 0.3,
      }).addTo(map)

      faultCircle = L.circleMarker(faultLatLng, {
        radius: 8,
        fillColor: "#ef4444",
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup(
          `
          <div class="text-neutral-900 font-sans p-1">
            <h4 class="font-bold text-red-600 text-sm mb-1">Titik Kerusakan (Fault)</h4>
            <p class="text-xs mb-1">Jarak Serat: <b>${faultDistance} ${distanceUnit}</b></p>
            <p class="text-[10px] text-muted-foreground">${estimatedFault.lat.toFixed(6)}, ${estimatedFault.lng.toFixed(6)}</p>
          </div>
          `,
          { closeButton: false }
        )
        .openPopup()

      // Pan map smoothly to the fault point
      map.setView(faultLatLng, 16)
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [isMapScriptLoaded, activePath, points, estimatedFault, distanceUnit]) // Listen to estimatedFault change to pan map

  // Sync marker location manually when fault distance updates without reloading map completely
  useEffect(() => {
    if (!mapInstanceRef.current || !estimatedFault) return
    const L = (window as any).L
    if (!L) return

    const map = mapInstanceRef.current
    const faultLatLng = [estimatedFault.lat, estimatedFault.lng]

    // Find and update the red circle marker positions dynamically
    map.eachLayer((layer: any) => {
      if (layer instanceof L.CircleMarker && layer.options.fillColor === "#ef4444") {
        layer.setLatLng(faultLatLng)
        if (layer.getPopup()) {
          layer.setPopupContent(`
            <div class="text-neutral-900 font-sans p-1">
              <h4 class="font-bold text-red-600 text-sm mb-1">Titik Kerusakan (Fault)</h4>
              <p class="text-xs mb-1">Jarak Serat: <b>${faultDistance} ${distanceUnit}</b></p>
              <p class="text-[10px] text-muted-foreground">${estimatedFault.lat.toFixed(6)}, ${estimatedFault.lng.toFixed(6)}</p>
            </div>
          `)
        }
      }
      if (layer instanceof L.Circle && layer.options.fillColor === "#ef4444") {
        layer.setLatLng(faultLatLng)
      }
    })

    // Optionally center map on marker
    map.panTo(faultLatLng)
  }, [estimatedFault, faultDistance, distanceUnit])

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      {/* Header Panel */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-3">
          <MapPin className="h-7 w-7 text-primary animate-pulse" />
          OTDR Distance-to-Fault Locator
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Lokasikan titik putus kabel serat optik (fiber cut) secara visual di peta dengan mengunggah rute KML/KMZ dan memasukkan pembacaan jarak OTDR.
        </p>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 lg:gap-8 items-start">
        
        {/* Left column - upload & configurations */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {/* 1. Upload Card */}
          <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground uppercase tracking-wider">
              <Upload className="h-4 w-4 text-primary" />
              Unggah Rute Kabel
            </h2>

            {status === "idle" || status === "error" ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition-all",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".kml,.kmz"
                  className="sr-only"
                  onChange={handleFileChange}
                />
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-background">
                  <Upload className="h-4 w-4 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold">Tarik berkas KML/KMZ di sini</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">atau klik untuk menelusuri berkas (Maks 10MB)</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate max-w-[150px]">{file?.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {file ? (file.size / 1024).toFixed(1) : 0} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Error notifications */}
            <AnimatePresence>
              {status === "error" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-red-400 flex items-start gap-2"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  <span>{errorMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Loading state indicator */}
            {status === "uploading" && (
              <div className="flex items-center justify-center py-4 gap-2 text-xs text-muted-foreground">
                <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span>Mengunggah & mengurai berkas...</span>
              </div>
            )}
          </div>

          {/* 2. Configuration Card (Active when file uploaded) */}
          <AnimatePresence>
            {paths.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm space-y-6"
              >
                <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground uppercase tracking-wider">
                  <Sliders className="h-4 w-4 text-primary" />
                  Parameter OTDR & Slack
                </h2>

                {/* Path Selector if multiple LineStrings in KML */}
                {paths.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <Compass className="h-3 w-3" /> Pilih Rute Kabel ({paths.length})
                    </label>
                    <select
                      value={selectedPathIndex}
                      onChange={(e) => {
                        const idx = Number(e.target.value)
                        setSelectedPathIndex(idx)
                        // Reset slider max based on chosen path length
                        const newLen = calculatePathLength(paths[idx].coords)
                        setFaultDistance(Math.min(faultDistance, Math.round(newLen)))
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-white/10 bg-white/[0.03] text-xs focus:outline-none focus:border-white/30 text-foreground bg-neutral-900"
                    >
                      {paths.map((p, idx) => (
                        <option key={idx} value={idx}>
                          {p.name || `Rute ${idx + 1}`} ({p.coords.length} Node)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Distance input and unit */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground font-medium">Jarak Kerusakan (OTDR)</label>
                    <div className="flex bg-white/[0.03] border border-white/10 p-0.5 rounded-lg text-[10px]">
                      <button
                        type="button"
                        onClick={() => {
                          if (distanceUnit === "km") {
                            setFaultDistance(Math.round(faultDistance * 1000))
                            setDistanceUnit("m")
                          }
                        }}
                        className={cn(
                          "px-2 py-0.5 rounded-md font-bold transition-all",
                          distanceUnit === "m" ? "bg-primary text-black" : "text-muted-foreground"
                        )}
                      >
                        Meter
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (distanceUnit === "m") {
                            setFaultDistance(Number((faultDistance / 1000).toFixed(3)))
                            setDistanceUnit("km")
                          }
                        }}
                        className={cn(
                          "px-2 py-0.5 rounded-md font-bold transition-all",
                          distanceUnit === "km" ? "bg-primary text-black" : "text-muted-foreground"
                        )}
                      >
                        KM
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={faultDistance}
                      min="0"
                      step={distanceUnit === "km" ? "0.001" : "1"}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value))
                        setFaultDistance(val)
                      }}
                      className="flex-1 h-9 px-3 rounded-lg border border-white/10 bg-white/[0.03] text-xs focus:outline-none focus:border-white/30 text-foreground font-mono"
                    />
                    <span className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.05] flex items-center text-xs font-semibold">
                      {distanceUnit}
                    </span>
                  </div>

                  {/* Slider control */}
                  <input
                    type="range"
                    min="0"
                    max={distanceUnit === "km" ? Number((totalPathLengthGeo / 1000).toFixed(3)) : Math.round(totalPathLengthGeo)}
                    step={distanceUnit === "km" ? "0.01" : "10"}
                    value={faultDistance}
                    onChange={(e) => setFaultDistance(Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                    <span>0 {distanceUnit}</span>
                    <span>
                      Jalur:{" "}
                      {(distanceUnit === "km"
                        ? totalPathLengthGeo / 1000
                        : totalPathLengthGeo
                      ).toFixed(1)}{" "}
                      {distanceUnit}
                    </span>
                  </div>
                </div>

                {/* Slack Factor */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground font-medium">Faktor Slack Kabel</label>
                    <span className="text-xs font-mono font-semibold text-primary">{slackFactor.toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.90"
                    max="1.10"
                    step="0.005"
                    value={slackFactor}
                    onChange={(e) => setSlackFactor(Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  
                  {/* Presets */}
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setSlackFactor(1.0)}
                      className={cn(
                        "py-1 rounded text-[9px] font-medium border transition-all",
                        slackFactor === 1.0
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-white/[0.02] text-muted-foreground border-white/5 hover:border-white/10"
                      )}
                    >
                      1.000 (No Slack)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlackFactor(0.97)}
                      className={cn(
                        "py-1 rounded text-[9px] font-medium border transition-all",
                        slackFactor === 0.97
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-white/[0.02] text-muted-foreground border-white/5 hover:border-white/10"
                      )}
                    >
                      0.970 (Standar)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlackFactor(0.95)}
                      className={cn(
                        "py-1 rounded text-[9px] font-medium border transition-all",
                        slackFactor === 0.95
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-white/[0.02] text-muted-foreground border-white/5 hover:border-white/10"
                      )}
                    >
                      0.950 (High Slack)
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    *Membantu menyamakan perbedaan panjang serat optik (OTDR) dengan jarak geografis riil di peta.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>

        {/* Right column - interactive map & results display */}
        <div className="space-y-6">
          {paths.length > 0 ? (
            <div className="space-y-6">
              
              {/* Fault Result Card */}
              <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm relative overflow-hidden grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                {/* Background glow */}
                <div className="absolute inset-0 pointer-events-none opacity-5 bg-gradient-to-r from-red-500 to-transparent blur-3xl" />

                {/* Left metrics */}
                <div className="space-y-3 relative">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                      Koordinasi Titik Putus (Estimasi)
                    </span>
                    {estimatedFault ? (
                      <div className="text-2xl font-mono font-bold tracking-tight text-red-500 mt-1 flex items-center gap-2">
                        {estimatedFault.lat.toFixed(6)}, {estimatedFault.lng.toFixed(6)}
                      </div>
                    ) : (
                      <div className="text-xl font-medium mt-1">Mengalkulasi...</div>
                    )}
                  </div>

                  {/* Actions buttons */}
                  {estimatedFault && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={copyToClipboard}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs font-semibold hover:border-white/20 hover:bg-white/[0.06] transition-all cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copied ? "Tersalin!" : "Salin Koordinat"}
                      </button>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${estimatedFault.lat},${estimatedFault.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-all shadow-md shadow-primary/10"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Navigasi Google Maps
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Right metrics (Closest pole & Path info) */}
                <div className="space-y-3 relative border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6 text-sm">
                  {closestPointResult ? (
                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                        Objek / Tiang Terdekat
                      </span>
                      <span className="font-bold text-foreground block mt-0.5">
                        {closestPointResult.point.name}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Info className="h-3 w-3 text-primary" />
                        Sekitar **{closestPointResult.distance.toFixed(1)} meter** dari tiang ini.
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                        Objek Terdekat
                      </span>
                      <span className="text-xs text-muted-foreground block mt-1">
                        Tidak ada tiang/koordinat objek diunggah di file KML.
                      </span>
                    </div>
                  )}

                  {estimatedFault?.isOut && (
                    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-2.5 text-xs text-yellow-300 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-yellow-400 mt-0.5" />
                      <span>Jarak OTDR melebihi panjang jalur KML. Menampilkan titik koordinat ujung rute.</span>
                    </div>
                  )}

                  {/* Distance specs */}
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-1">
                    <div>
                      <span className="text-[9px] text-muted-foreground block">Panjang Kabel (Geografis)</span>
                      <span className="font-semibold">{totalPathLengthGeo.toFixed(1)} m</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground block">Estimasi Serat Optik</span>
                      <span className="font-semibold">{(totalPathLengthGeo / slackFactor).toFixed(1)} m</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Map Card */}
              <div className="rounded-2xl border border-white/10 bg-card/40 p-1 backdrop-blur-sm overflow-hidden h-[450px] relative">
                {!isMapScriptLoaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/70 z-10 gap-2">
                    <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-xs text-muted-foreground">Memuat peta...</span>
                  </div>
                )}
                <div ref={mapContainerRef} className="h-full w-full rounded-xl" style={{ minHeight: "440px" }} />
              </div>
              
              {/* Detailed Path Info & Nodes */}
              <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground uppercase tracking-wider border-b border-white/10 pb-2">
                  <ListOrdered className="h-4 w-4 text-primary" />
                  Detail Verteks Rute Kabel
                </h3>
                <div className="max-h-60 overflow-y-auto pr-1 text-xs">
                  <table className="w-full text-left font-mono">
                    <thead>
                      <tr className="text-muted-foreground border-b border-white/5 pb-1">
                        <th className="py-2 px-2">No. Node</th>
                        <th className="py-2 px-2">Koordinat (Lat, Lng)</th>
                        <th className="py-2 px-2">Jarak Kumulatif (Geografis)</th>
                        <th className="py-2 px-2">Estimasi Serat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {activePath.coords.map((c, idx) => {
                        const geoDist = pathDistances[idx] || 0
                        const fiberDist = geoDist / slackFactor
                        const inputMeters = distanceUnit === "km" ? faultDistance * 1000 : faultDistance
                        const isAfterFault = geoDist > inputMeters * slackFactor

                        return (
                          <tr
                            key={idx}
                            className={cn(
                              "hover:bg-white/[0.02]",
                              isAfterFault ? "text-muted-foreground/60" : "text-foreground font-semibold"
                            )}
                          >
                            <td className="py-2 px-2 flex items-center gap-1.5">
                              <span className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isAfterFault ? "bg-neutral-600" : "bg-primary"
                              )} />
                              #{idx + 1}
                            </td>
                            <td className="py-2 px-2">
                              {c.lat.toFixed(6)}, {c.lng.toFixed(6)}
                            </td>
                            <td className="py-2 px-2">
                              {geoDist.toFixed(1)} m
                            </td>
                            <td className="py-2 px-2">
                              {fiberDist.toFixed(1)} m
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : (
            /* Placeholder state before upload */
            <div className="h-[500px] rounded-2xl border border-white/10 bg-card/10 flex flex-col items-center justify-center text-center p-8 backdrop-blur-sm">
              <Compass className="h-16 w-16 text-muted-foreground/30 animate-spin-slow mb-4" />
              <h3 className="text-base font-semibold text-muted-foreground">Peta Deteksi Belum Aktif</h3>
              <p className="text-xs text-muted-foreground/75 mt-2 max-w-sm">
                Harap unggah file KML/KMZ yang berisi rute kabel serat optik Anda pada panel kiri untuk melihat jalur kabel dan melacak titik kerusakan secara interaktif.
              </p>
              
              {/* Decorative instructions list */}
              <div className="mt-8 text-left space-y-3.5 text-[11px] text-muted-foreground/70 max-w-xs border-t border-white/5 pt-6">
                <div className="flex gap-2">
                  <span className="h-4 w-4 shrink-0 rounded-full bg-white/5 flex items-center justify-center font-bold text-[9px]">1</span>
                  <span>Unggah file survey rute tiang atau rute kabel (`LineString`) (.kml/.kmz).</span>
                </div>
                <div className="flex gap-2">
                  <span className="h-4 w-4 shrink-0 rounded-full bg-white/5 flex items-center justify-center font-bold text-[9px]">2</span>
                  <span>Masukkan angka pembacaan kerusakan (Event Fault) dari trace alat OTDR Anda.</span>
                </div>
                <div className="flex gap-2">
                  <span className="h-4 w-4 shrink-0 rounded-full bg-white/5 flex items-center justify-center font-bold text-[9px]">3</span>
                  <span>Peta akan secara otomatis menandai lokasi kerusakan dan mendeteksi tiang terdekat.</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
