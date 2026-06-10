"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Navigation,
  Copy,
  Download,
  FileText,
  MapPin,
  RefreshCw,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Compass,
  ExternalLink,
  Trash2,
  ClipboardPaste,
  Globe,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------
// Conversion Utilities
// ---------------------------------------------------------

/** Converts DMS components to Decimal Degrees */
function dmsToDD(
  degrees: number,
  minutes: number,
  seconds: number,
  direction: "N" | "S" | "E" | "W"
): number {
  const dd = Math.abs(degrees) + minutes / 60 + seconds / 3600
  return direction === "S" || direction === "W" ? -dd : dd
}

/** Converts Decimal Degrees to DMS components */
function ddToDMS(dd: number): { degrees: number; minutes: number; seconds: number } {
  const absDd = Math.abs(dd)
  const degrees = Math.floor(absDd)
  const minutesFull = (absDd - degrees) * 60
  const minutes = Math.floor(minutesFull)
  const seconds = (minutesFull - minutes) * 60
  return { degrees, minutes, seconds: Math.round(seconds * 10000) / 10000 }
}

/** Determines hemisphere direction from DD value */
function getLatDirection(dd: number): "N" | "S" {
  return dd >= 0 ? "N" : "S"
}
function getLngDirection(dd: number): "E" | "W" {
  return dd >= 0 ? "E" : "W"
}

/** Format DMS string */
function formatDMS(deg: number, min: number, sec: number, dir: string): string {
  return `${deg}°${min}'${sec.toFixed(4)}"${dir}`
}

// ---------------------------------------------------------
// Batch Parsing Engine — Resilient Multi-Format Parser
// ---------------------------------------------------------

interface ParsedCoord {
  id: number
  original: string
  lat: number | null
  lng: number | null
  latDMS: string
  lngDMS: string
  latDD: string
  lngDD: string
  status: "success" | "error"
  error?: string
}

/**
 * Parse a single coordinate line.
 * Supports formats:
 *   6°12'31.68"S, 106°50'44.16"E
 *   6°12'31.68"S 106°50'44.16"E
 *   -6.2088, 106.8456
 *   -6.2088 106.8456
 *   6 12 31.68 S 106 50 44.16 E
 *   6d 12m 31.68s S, 106d 50m 44.16s E
 *   S6°12'31.68", E106°50'44.16"
 *   S 6 12 31.68, E 106 50 44.16
 */
function parseLine(line: string, id: number): ParsedCoord {
  const trimmed = line.trim()
  if (!trimmed) {
    return {
      id, original: trimmed,
      lat: null, lng: null,
      latDMS: "", lngDMS: "", latDD: "", lngDD: "",
      status: "error", error: "Empty line",
    }
  }

  // Try DMS format: various flavors
  // Pattern: optional direction prefix, degrees (with optional °/d), minutes (with optional '/m), seconds (optional, with optional "/s), optional direction suffix
  const dmsComponentPattern =
    /([NSEW]?)\s*(-?\d+(?:\.\d+)?)[°d\s]+(\d+(?:\.\d+)?)['\u2019m\s]*(?:(\d+(?:\.\d+)?)[""\u201D\u201Cs]?)?\s*([NSEW]?)/gi

  const dmsMatches = [...trimmed.matchAll(dmsComponentPattern)]

  if (dmsMatches.length >= 2) {
    try {
      const parts = dmsMatches.slice(0, 2).map((m) => {
        const dirPrefix = m[1].toUpperCase()
        const dirSuffix = m[5].toUpperCase()
        const dir = dirPrefix || dirSuffix || ""
        const deg = parseFloat(m[2])
        const min = parseFloat(m[3])
        const sec = m[4] ? parseFloat(m[4]) : 0
        return { deg, min, sec, dir }
      })

      // Determine which is lat, which is lng
      let latPart = parts[0]
      let lngPart = parts[1]

      // If directions are given, use them to determine
      if (
        (latPart.dir === "E" || latPart.dir === "W") &&
        (lngPart.dir === "N" || lngPart.dir === "S")
      ) {
        ;[latPart, lngPart] = [lngPart, latPart]
      }

      const latDir =
        (latPart.dir as "N" | "S" | "") || (latPart.deg < 0 ? "S" : "N")
      const lngDir =
        (lngPart.dir as "E" | "W" | "") || (lngPart.deg < 0 ? "W" : "E")

      const lat = dmsToDD(latPart.deg, latPart.min, latPart.sec, latDir as "N" | "S")
      const lng = dmsToDD(lngPart.deg, lngPart.min, lngPart.sec, lngDir as "E" | "W")

      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return {
          id,
          original: trimmed,
          lat: null,
          lng: null,
          latDMS: "",
          lngDMS: "",
          latDD: "",
          lngDD: "",
          status: "error",
          error: "Latitude must be within [-90, 90] and Longitude within [-180, 180]",
        }
      }

      const latDmsObj = ddToDMS(lat)
      const lngDmsObj = ddToDMS(lng)

      return {
        id,
        original: trimmed,
        lat,
        lng,
        latDMS: formatDMS(latDmsObj.degrees, latDmsObj.minutes, latDmsObj.seconds, getLatDirection(lat)),
        lngDMS: formatDMS(lngDmsObj.degrees, lngDmsObj.minutes, lngDmsObj.seconds, getLngDirection(lng)),
        latDD: lat.toFixed(6),
        lngDD: lng.toFixed(6),
        status: "success",
      }
    } catch {
      // Fall through to DD parsing
    }
  }

  // Try DD format: -6.2088, 106.8456 or -6.2088 106.8456
  const ddPattern = /(-?\d+(?:\.\d+)?)\s*[,;\s]+\s*(-?\d+(?:\.\d+)?)/
  const ddMatch = trimmed.match(ddPattern)

  if (ddMatch) {
    const lat = parseFloat(ddMatch[1])
    const lng = parseFloat(ddMatch[2])

    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      const latDmsObj = ddToDMS(lat)
      const lngDmsObj = ddToDMS(lng)

      return {
        id,
        original: trimmed,
        lat,
        lng,
        latDMS: formatDMS(latDmsObj.degrees, latDmsObj.minutes, latDmsObj.seconds, getLatDirection(lat)),
        lngDMS: formatDMS(lngDmsObj.degrees, lngDmsObj.minutes, lngDmsObj.seconds, getLngDirection(lng)),
        latDD: lat.toFixed(6),
        lngDD: lng.toFixed(6),
        status: "success",
      }
    }
  }

  return {
    id,
    original: trimmed,
    lat: null,
    lng: null,
    latDMS: "",
    lngDMS: "",
    latDD: "",
    lngDD: "",
    status: "error",
    error: "Unrecognized format",
  }
}

// ---------------------------------------------------------
// KML Export Generator
// ---------------------------------------------------------

function generateKML(coords: ParsedCoord[]): string {
  const placemarks = coords
    .filter((c) => c.status === "success" && c.lat !== null && c.lng !== null)
    .map(
      (c, i) => `    <Placemark>
      <name>Point ${i + 1}</name>
      <description>${c.original}</description>
      <Point>
        <coordinates>${c.lng},${c.lat},0</coordinates>
      </Point>
    </Placemark>`
    )
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>DMS-DD Converted Coordinates</name>
    <description>Exported from FTTH Tool — DMS ↔ DD Converter</description>
${placemarks}
  </Document>
</kml>`
}

// ---------------------------------------------------------
// CSV Export Generator
// ---------------------------------------------------------

function generateCSV(coords: ParsedCoord[]): string {
  const headers = ["No", "Original Input", "Latitude (DD)", "Longitude (DD)", "Latitude (DMS)", "Longitude (DMS)", "Status"]
  const rows = coords.map((c) => [
    c.id,
    `"${c.original}"`,
    c.latDD || "-",
    c.lngDD || "-",
    c.latDMS || "-",
    c.lngDMS || "-",
    c.status,
  ])
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
}

// ---------------------------------------------------------
// Interactive Compass Visualizer (SVG)
// ---------------------------------------------------------

function CompassVisualizer({ lat, lng }: { lat: number | null; lng: number | null }) {
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const r = 70

  // Calculate needle angles
  // Latitude: 0° at equator, ±90° at poles → map to angle on compass
  // We show a simple crosshair indicator
  const latNorm = lat !== null ? lat / 90 : 0
  const lngNorm = lng !== null ? lng / 180 : 0

  // Dot position (from center, normalized to radius)
  const dotX = cx + lngNorm * (r * 0.8)
  const dotY = cy - latNorm * (r * 0.8)

  const hasCoord = lat !== null && lng !== null

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="drop-shadow-lg"
      >
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />

        {/* Grid lines */}
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="4 4" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="4 4" />

        {/* Cardinal directions */}
        <text x={cx} y={cy - r - 12} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontWeight="700">N</text>
        <text x={cx} y={cy + r + 18} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontWeight="700">S</text>
        <text x={cx + r + 14} y={cy + 4} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontWeight="700">E</text>
        <text x={cx - r - 14} y={cy + 4} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontWeight="700">W</text>

        {/* Center crosshair */}
        <circle cx={cx} cy={cy} r="2" fill="rgba(255,255,255,0.15)" />

        {/* Coordinate dot */}
        {hasCoord && (
          <>
            {/* Crosshair lines to dot */}
            <line x1={dotX} y1={cy - r} x2={dotX} y2={cy + r} stroke="rgba(168,85,247,0.15)" strokeWidth="0.5" />
            <line x1={cx - r} y1={dotY} x2={cx + r} y2={dotY} stroke="rgba(168,85,247,0.15)" strokeWidth="0.5" />

            {/* Glow */}
            <circle cx={dotX} cy={dotY} r="8" fill="rgba(168,85,247,0.15)" />
            <circle cx={dotX} cy={dotY} r="4" fill="rgba(168,85,247,0.8)" stroke="rgba(168,85,247,1)" strokeWidth="1">
              <animate attributeName="r" values="4;5.5;4" dur="2s" repeatCount="indefinite" />
            </circle>
          </>
        )}
      </svg>
      {hasCoord && (
        <div className="text-center space-y-0.5">
          <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Position</div>
          <div className="text-xs font-mono text-foreground">
            {lat!.toFixed(4)}°, {lng!.toFixed(4)}°
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------

export default function DmsDdConverterPage() {
  const [locale, setLocale] = useState<"en" | "id">("en")
  const [activeMode, setActiveMode] = useState<"single" | "batch">("single")
  const [singleDirection, setSingleDirection] = useState<"dms-to-dd" | "dd-to-dms">("dms-to-dd")

  // Single DMS → DD inputs
  const [latDeg, setLatDeg] = useState(6)
  const [latMin, setLatMin] = useState(12)
  const [latSec, setLatSec] = useState(31.68)
  const [latDir, setLatDir] = useState<"N" | "S">("S")
  const [lngDeg, setLngDeg] = useState(106)
  const [lngMin, setLngMin] = useState(50)
  const [lngSec, setLngSec] = useState(44.16)
  const [lngDir, setLngDir] = useState<"E" | "W">("E")

  // Single DD → DMS inputs
  const [ddLat, setDdLat] = useState(-6.2088)
  const [ddLng, setDdLng] = useState(106.8456)

  // Batch state
  const [batchInput, setBatchInput] = useState("")
  const [batchResults, setBatchResults] = useState<ParsedCoord[]>([])

  // Copy feedback
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("locale")
    if (stored === "id" || stored === "en") setLocale(stored)
  }, [])

  // ── Translations ──
  const t = {
    title: locale === "id" ? "Konverter DMS ↔ DD" : "DMS ↔ DD Converter",
    subtitle: locale === "id"
      ? "Konversi koordinat tunggal atau massal antara Degrees/Minutes/Seconds (DMS) dan Desimal Derajat (DD) dengan ekspor CSV & KML."
      : "Convert single or batch coordinates between Degrees/Minutes/Seconds (DMS) and Decimal Degrees (DD) with CSV & KML export.",
    single: locale === "id" ? "Tunggal" : "Single",
    batch: locale === "id" ? "Massal" : "Batch",
    dmsToDD: "DMS → DD",
    ddToDMS: "DD → DMS",
    latitude: locale === "id" ? "Lintang" : "Latitude",
    longitude: locale === "id" ? "Bujur" : "Longitude",
    degrees: locale === "id" ? "Derajat" : "Degrees",
    minutes: locale === "id" ? "Menit" : "Minutes",
    seconds: locale === "id" ? "Detik" : "Seconds",
    direction: locale === "id" ? "Arah" : "Direction",
    result: locale === "id" ? "Hasil Konversi" : "Conversion Result",
    copy: locale === "id" ? "Salin" : "Copy",
    copied: locale === "id" ? "Tersalin!" : "Copied!",
    openMaps: locale === "id" ? "Buka di Google Maps" : "Open in Google Maps",
    batchPlaceholder: locale === "id"
      ? "Tempel koordinat di sini (satu baris per titik)...\n\nFormat yang didukung:\n6°12'31.68\"S, 106°50'44.16\"E\n-6.2088, 106.8456\n6 12 31.68 S 106 50 44.16 E"
      : "Paste coordinates here (one per line)...\n\nSupported formats:\n6°12'31.68\"S, 106°50'44.16\"E\n-6.2088, 106.8456\n6 12 31.68 S 106 50 44.16 E",
    parse: locale === "id" ? "Parsing & Konversi" : "Parse & Convert",
    exportCSV: locale === "id" ? "Ekspor CSV" : "Export CSV",
    exportKML: locale === "id" ? "Ekspor KML" : "Export KML",
    clear: locale === "id" ? "Bersihkan" : "Clear",
    reset: "Reset",
    originalInput: locale === "id" ? "Input Asli" : "Original Input",
    status: "Status",
    noResults: locale === "id" ? "Belum ada hasil. Tempel koordinat dan klik \"Parsing & Konversi\"." : "No results yet. Paste coordinates and click \"Parse & Convert\".",
    successCount: (n: number) => locale === "id" ? `${n} berhasil` : `${n} success`,
    errorCount: (n: number) => locale === "id" ? `${n} gagal` : `${n} failed`,
    compassWidget: locale === "id" ? "Visualisasi Orientasi" : "Orientation Visualizer",
    guidelines: locale === "id" ? "Panduan Format" : "Format Guide",
  }

  // ── Single Mode Calculations ──
  const singleDMStoDD = useMemo(() => {
    const lat = dmsToDD(latDeg, latMin, latSec, latDir)
    const lng = dmsToDD(lngDeg, lngMin, lngSec, lngDir)
    return { lat, lng }
  }, [latDeg, latMin, latSec, latDir, lngDeg, lngMin, lngSec, lngDir])

  const singleDDtoDMS = useMemo(() => {
    const latObj = ddToDMS(ddLat)
    const lngObj = ddToDMS(ddLng)
    return {
      latStr: formatDMS(latObj.degrees, latObj.minutes, latObj.seconds, getLatDirection(ddLat)),
      lngStr: formatDMS(lngObj.degrees, lngObj.minutes, lngObj.seconds, getLngDirection(ddLng)),
    }
  }, [ddLat, ddLng])

  // The currently displayed lat/lng for the compass
  const compassCoord = useMemo(() => {
    if (activeMode === "single") {
      if (singleDirection === "dms-to-dd") {
        return { lat: singleDMStoDD.lat, lng: singleDMStoDD.lng }
      } else {
        return { lat: ddLat, lng: ddLng }
      }
    }
    // For batch, show the first successful result
    const first = batchResults.find((r) => r.status === "success")
    return first ? { lat: first.lat, lng: first.lng } : { lat: null, lng: null }
  }, [activeMode, singleDirection, singleDMStoDD, ddLat, ddLng, batchResults])

  // ── Copy to Clipboard ──
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(text)
      setTimeout(() => setCopyFeedback(null), 1800)
    })
  }, [])

  // ── Batch Processing ──
  const handleBatchParse = useCallback(() => {
    const lines = batchInput.split("\n").filter((l) => l.trim().length > 0)
    const results = lines.map((line, i) => parseLine(line, i + 1))
    setBatchResults(results)
  }, [batchInput])

  const handleBatchClear = useCallback(() => {
    setBatchInput("")
    setBatchResults([])
  }, [])

  // ── Batch Export ──
  const handleExportCSV = useCallback(() => {
    const csv = generateCSV(batchResults)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "coordinate_conversion.csv"
    a.click()
    URL.revokeObjectURL(url)
  }, [batchResults])

  const handleExportKML = useCallback(() => {
    const kml = generateKML(batchResults)
    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "coordinate_conversion.kml"
    a.click()
    URL.revokeObjectURL(url)
  }, [batchResults])

  // ── Reset ──
  const handleReset = useCallback(() => {
    setLatDeg(6); setLatMin(12); setLatSec(31.68); setLatDir("S")
    setLngDeg(106); setLngMin(50); setLngSec(44.16); setLngDir("E")
    setDdLat(-6.2088); setDdLng(106.8456)
    setBatchInput(""); setBatchResults([])
  }, [])

  // ── Batch Stats ──
  const batchStats = useMemo(() => {
    const success = batchResults.filter((r) => r.status === "success").length
    const error = batchResults.filter((r) => r.status === "error").length
    return { success, error, total: batchResults.length }
  }, [batchResults])

  return (
    <div className="space-y-6 max-w-7xl pb-10">
      {/* ═══════ Title Block ═══════ */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
            <Navigation className="h-7 w-7 text-primary" />
            {t.title}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {t.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="h-9 px-4 rounded-xl text-sm font-medium border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition-colors cursor-pointer flex items-center gap-2 self-start md:self-auto"
        >
          <RefreshCw className="h-4 w-4" />
          {t.reset}
        </button>
      </div>

      {/* ═══════ Mode Tabs ═══════ */}
      <div className="flex border-b border-white/10">
        <button
          type="button"
          onClick={() => setActiveMode("single")}
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all",
            activeMode === "single"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
          )}
        >
          <Compass className="h-4 w-4" />
          {t.single}
        </button>
        <button
          type="button"
          onClick={() => setActiveMode("batch")}
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all",
            activeMode === "batch"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
          )}
        >
          <ClipboardPaste className="h-4 w-4" />
          {t.batch}
        </button>
      </div>

      {/* ═══════ SINGLE MODE ═══════ */}
      {activeMode === "single" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start"
        >
          {/* Left: Input & Output */}
          <div className="space-y-6">
            {/* Direction toggle */}
            <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/10 self-start w-fit">
              <button
                type="button"
                onClick={() => setSingleDirection("dms-to-dd")}
                className={cn(
                  "px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2",
                  singleDirection === "dms-to-dd"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                {t.dmsToDD}
              </button>
              <button
                type="button"
                onClick={() => setSingleDirection("dd-to-dms")}
                className={cn(
                  "px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2",
                  singleDirection === "dd-to-dms"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                {t.ddToDMS}
              </button>
            </div>

            {/* ── DMS → DD Input ── */}
            <AnimatePresence mode="wait">
              {singleDirection === "dms-to-dd" ? (
                <motion.div
                  key="dms-input"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-2xl border border-white/10 bg-card/30 p-6 backdrop-blur-md space-y-6"
                >
                  <h2 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {t.dmsToDD} — Input
                  </h2>

                  {/* Latitude Row */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.latitude}</label>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t.degrees} (°)</span>
                        <input
                          type="number"
                          min={0}
                          max={90}
                          value={latDeg}
                          onChange={(e) => setLatDeg(Math.min(90, Math.max(0, Number(e.target.value))))}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t.minutes} (&apos;)</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={latMin}
                          onChange={(e) => setLatMin(Math.min(59, Math.max(0, Number(e.target.value))))}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t.seconds} (&quot;)</span>
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          max={59.9999}
                          value={latSec}
                          onChange={(e) => setLatSec(Math.min(59.9999, Math.max(0, Number(e.target.value))))}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t.direction}</span>
                        <select
                          value={latDir}
                          onChange={(e) => setLatDir(e.target.value as "N" | "S")}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                        >
                          <option value="N" className="bg-neutral-900">N (North / Utara)</option>
                          <option value="S" className="bg-neutral-900">S (South / Selatan)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Longitude Row */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.longitude}</label>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t.degrees} (°)</span>
                        <input
                          type="number"
                          min={0}
                          max={180}
                          value={lngDeg}
                          onChange={(e) => setLngDeg(Math.min(180, Math.max(0, Number(e.target.value))))}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t.minutes} (&apos;)</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={lngMin}
                          onChange={(e) => setLngMin(Math.min(59, Math.max(0, Number(e.target.value))))}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t.seconds} (&quot;)</span>
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          max={59.9999}
                          value={lngSec}
                          onChange={(e) => setLngSec(Math.min(59.9999, Math.max(0, Number(e.target.value))))}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t.direction}</span>
                        <select
                          value={lngDir}
                          onChange={(e) => setLngDir(e.target.value as "E" | "W")}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                        >
                          <option value="E" className="bg-neutral-900">E (East / Timur)</option>
                          <option value="W" className="bg-neutral-900">W (West / Barat)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Result */}
                  <div className="border-t border-white/10 pt-5 space-y-3">
                    <h3 className="text-xs text-primary font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      {t.result}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-1.5">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase">{t.latitude} (DD)</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold font-mono text-foreground">{singleDMStoDD.lat.toFixed(6)}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(singleDMStoDD.lat.toFixed(6))}
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
                            title={t.copy}
                          >
                            {copyFeedback === singleDMStoDD.lat.toFixed(6) ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-1.5">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase">{t.longitude} (DD)</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold font-mono text-foreground">{singleDMStoDD.lng.toFixed(6)}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(singleDMStoDD.lng.toFixed(6))}
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
                            title={t.copy}
                          >
                            {copyFeedback === singleDMStoDD.lng.toFixed(6) ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Combined copy + Maps button */}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(`${singleDMStoDD.lat.toFixed(6)}, ${singleDMStoDD.lng.toFixed(6)}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-xs font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {t.copy} Lat, Lng
                      </button>
                      <a
                        href={`https://www.google.com/maps?q=${singleDMStoDD.lat.toFixed(6)},${singleDMStoDD.lng.toFixed(6)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t.openMaps}
                      </a>
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* ── DD → DMS Input ── */
                <motion.div
                  key="dd-input"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-2xl border border-white/10 bg-card/30 p-6 backdrop-blur-md space-y-6"
                >
                  <h2 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {t.ddToDMS} — Input
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.latitude} (DD)</label>
                      <input
                        type="number"
                        step="0.000001"
                        min={-90}
                        max={90}
                        value={ddLat}
                        onChange={(e) => setDdLat(Number(e.target.value))}
                        className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                      />
                      <span className="text-[10px] text-muted-foreground">-90 to 90 ({locale === "id" ? "negatif = Selatan" : "negative = South"})</span>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.longitude} (DD)</label>
                      <input
                        type="number"
                        step="0.000001"
                        min={-180}
                        max={180}
                        value={ddLng}
                        onChange={(e) => setDdLng(Number(e.target.value))}
                        className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                      />
                      <span className="text-[10px] text-muted-foreground">-180 to 180 ({locale === "id" ? "negatif = Barat" : "negative = West"})</span>
                    </div>
                  </div>

                  {/* Result */}
                  <div className="border-t border-white/10 pt-5 space-y-3">
                    <h3 className="text-xs text-primary font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      {t.result}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-1.5">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase">{t.latitude} (DMS)</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold font-mono text-foreground">{singleDDtoDMS.latStr}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(singleDDtoDMS.latStr)}
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
                            title={t.copy}
                          >
                            {copyFeedback === singleDDtoDMS.latStr ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-1.5">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase">{t.longitude} (DMS)</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold font-mono text-foreground">{singleDDtoDMS.lngStr}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(singleDDtoDMS.lngStr)}
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
                            title={t.copy}
                          >
                            {copyFeedback === singleDDtoDMS.lngStr ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(`${singleDDtoDMS.latStr}, ${singleDDtoDMS.lngStr}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-xs font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {t.copy} DMS
                      </button>
                      <a
                        href={`https://www.google.com/maps?q=${ddLat},${ddLng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t.openMaps}
                      </a>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Compass + Guide */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-card/20 p-6 backdrop-blur-sm flex flex-col items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-primary" />
                {t.compassWidget}
              </h3>
              <CompassVisualizer lat={compassCoord.lat} lng={compassCoord.lng} />
            </div>

            {/* Format guide */}
            <div className="rounded-2xl border border-white/10 bg-card/20 p-6 backdrop-blur-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Info className="h-4 w-4 text-primary" />
                {t.guidelines}
              </h3>
              <div className="space-y-3 text-xs text-muted-foreground">
                <div className="space-y-1">
                  <span className="font-semibold text-foreground">DMS Format:</span>
                  <div className="font-mono text-[11px] bg-white/[0.02] border border-white/5 rounded-lg p-2.5 space-y-1">
                    <div>6°12&apos;31.68&quot;S, 106°50&apos;44.16&quot;E</div>
                    <div>6 12 31.68 S 106 50 44.16 E</div>
                    <div>6d 12m 31.68s S, 106d 50m 44.16s E</div>
                    <div>S6°12&apos;31.68&quot;, E106°50&apos;44.16&quot;</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="font-semibold text-foreground">DD Format:</span>
                  <div className="font-mono text-[11px] bg-white/[0.02] border border-white/5 rounded-lg p-2.5 space-y-1">
                    <div>-6.208800, 106.845600</div>
                    <div>-6.2088 106.8456</div>
                  </div>
                </div>
                <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 p-2.5 text-amber-300/80">
                  <span className="font-semibold">{locale === "id" ? "Catatan:" : "Note:"} </span>
                  {locale === "id"
                    ? "Latitude (Lintang) berkisar -90° s/d 90°. Longitude (Bujur) berkisar -180° s/d 180°. Indonesia: Lat ~-11 s/d 6, Lng ~95 s/d 141."
                    : "Latitude ranges -90° to 90°. Longitude ranges -180° to 180°. Indonesia: Lat ~-11 to 6, Lng ~95 to 141."}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══════ BATCH MODE ═══════ */}
      {activeMode === "batch" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
            {/* Left: Input Textarea */}
            <div className="rounded-2xl border border-white/10 bg-card/30 p-6 backdrop-blur-md space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <ClipboardPaste className="h-4 w-4 text-primary" />
                {locale === "id" ? "Input Koordinat Massal" : "Batch Coordinate Input"}
              </h2>

              <textarea
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                placeholder={t.batchPlaceholder}
                rows={14}
                className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02] text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30 transition-all resize-y leading-relaxed"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleBatchParse}
                  disabled={!batchInput.trim()}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    batchInput.trim()
                      ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20 cursor-pointer"
                      : "bg-white/[0.03] text-muted-foreground border border-white/10 cursor-not-allowed"
                  )}
                >
                  <Sparkles className="h-4 w-4" />
                  {t.parse}
                </button>
                <button
                  type="button"
                  onClick={handleBatchClear}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t.clear}
                </button>
              </div>
            </div>

            {/* Right: Compass + Guide for batch */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-card/20 p-6 backdrop-blur-sm flex flex-col items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-primary" />
                  {t.compassWidget}
                </h3>
                <CompassVisualizer lat={compassCoord.lat} lng={compassCoord.lng} />
              </div>

              {/* Batch stats */}
              {batchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="grid grid-cols-3 gap-3"
                >
                  <div className="rounded-xl border border-white/10 bg-card/40 p-4 text-center">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Total</span>
                    <div className="text-xl font-bold mt-1 text-foreground">{batchStats.total}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                    <span className="text-[10px] text-emerald-400 font-semibold uppercase block">{locale === "id" ? "Berhasil" : "Success"}</span>
                    <div className="text-xl font-bold mt-1 text-emerald-400">{batchStats.success}</div>
                  </div>
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                    <span className="text-[10px] text-red-400 font-semibold uppercase block">{locale === "id" ? "Gagal" : "Failed"}</span>
                    <div className="text-xl font-bold mt-1 text-red-400">{batchStats.error}</div>
                  </div>
                </motion.div>
              )}

              {/* Export buttons */}
              {batchStats.success > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3"
                >
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-foreground hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <FileText className="h-4 w-4" />
                    {t.exportCSV}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportKML}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20 cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    {t.exportKML}
                  </button>
                </motion.div>
              )}
            </div>
          </div>

          {/* ── Results Table ── */}
          {batchResults.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/10 bg-card/30 p-6 backdrop-blur-md"
            >
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {locale === "id" ? "Hasil Konversi Massal" : "Batch Conversion Results"}
                <span className="text-[10px] font-normal text-muted-foreground ml-auto">
                  {t.successCount(batchStats.success)} · {t.errorCount(batchStats.error)}
                </span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground text-xs font-semibold uppercase">
                      <th className="py-3 px-3 w-[50px]">#</th>
                      <th className="py-3 px-3">{t.originalInput}</th>
                      <th className="py-3 px-3">{t.latitude} (DD)</th>
                      <th className="py-3 px-3">{t.longitude} (DD)</th>
                      <th className="py-3 px-3">{t.latitude} (DMS)</th>
                      <th className="py-3 px-3">{t.longitude} (DMS)</th>
                      <th className="py-3 px-3 text-right w-[100px]">{t.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchResults.map((row) => (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-white/5 transition-colors duration-150",
                          row.status === "success"
                            ? "hover:bg-primary/[0.02]"
                            : "hover:bg-red-500/[0.02] bg-red-500/[0.01]"
                        )}
                      >
                        <td className="py-3 px-3 font-mono font-bold text-muted-foreground text-xs">
                          {row.id}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-foreground max-w-[200px] truncate" title={row.original}>
                          {row.original}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-foreground">
                          {row.latDD || "—"}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-foreground">
                          {row.lngDD || "—"}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-foreground">
                          {row.latDMS || "—"}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-foreground">
                          {row.lngDMS || "—"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {row.status === "success" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3 w-3" />
                              OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full" title={row.error}>
                              <AlertTriangle className="h-3 w-3" />
                              Error
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ) : (
            <div className="rounded-2xl border border-white/5 bg-card/10 p-12 text-center text-muted-foreground text-sm">
              <ClipboardPaste className="h-8 w-8 mx-auto mb-3 opacity-30" />
              {t.noResults}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
