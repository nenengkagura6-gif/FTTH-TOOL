"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { 
  Upload, 
  FileText, 
  LineChart as LineChartIcon, 
  Table as TableIcon, 
  Download, 
  Printer, 
  RefreshCw, 
  ShieldAlert, 
  CheckCircle,
  Sparkles
} from "lucide-react"
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  ReferenceDot
} from "recharts"

interface OtdrMetadata {
  cable_id: string
  fiber_id: string
  operator: string
  wavelength: string
  date: string
  pulse_width: string
  index_refraction: string
  parsed_mode: string
}

interface OtdrEvent {
  id: number
  type: string
  distance: number
  loss: number
  reflectance: number
  slope: number
  description: string
}

interface DataPoint {
  distance: number
  db: number
}

// Fallback/Demo Data
const demoMetadata: OtdrMetadata = {
  cable_id: "CABLE-AERIAL-24C",
  fiber_id: "CORE-04",
  operator: "Field Technician",
  wavelength: "1550 nm",
  date: "2026-06-05",
  pulse_width: "100 ns",
  index_refraction: "1.46820",
  parsed_mode: "Simulated SOR Trace Preview"
}

const demoEvents: OtdrEvent[] = [
  { id: 1, type: "Connector / Launch", distance: 0.000, loss: 0.45, reflectance: -45.2, slope: 0.22, description: "OTDR Connection Point" },
  { id: 2, type: "Fusion Splice", distance: 1.450, loss: 0.04, reflectance: -62.1, slope: 0.22, description: "Splicing point in ODC" },
  { id: 3, type: "Mechanical Splice / Bend", distance: 3.820, loss: 0.28, reflectance: -52.4, slope: 0.24, description: "High attenuation event" },
  { id: 4, type: "End of Fiber", distance: 5.210, loss: 23.40, reflectance: -18.5, slope: 0.00, description: "Total Reflection / End of Link" }
]

const demoDataPoints: DataPoint[] = Array.from({ length: 150 }, (_, i) => {
  const dist = (i / 150) * 6.5
  let db = 0

  if (dist < 5.21) {
    // Sloping trace representing normal attenuation
    let attenuation = dist * 0.22 // 0.22 dB/km
    if (dist > 1.45) attenuation += 0.04  // Splice 1 loss
    if (dist > 3.82) attenuation += 0.28  // Splice 2 loss
    db = -attenuation
  } else {
    // Drop off past end-of-fiber
    db = -25.0 - (dist - 5.21) * 6.0 + Math.sin(dist * 60) * 1.0
  }

  return {
    distance: Number(dist.toFixed(3)),
    db: Number(db.toFixed(2))
  }
})

export default function OtdrAnalyzerPage() {
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<OtdrMetadata | null>(null)
  const [events, setEvents] = useState<OtdrEvent[]>([])
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Load demo data
  const handleLoadDemo = () => {
    setLoading(true)
    setErrorMsg(null)
    setTimeout(() => {
      setFileName("demo_trace.sor")
      setMetadata(demoMetadata)
      setEvents(demoEvents)
      setDataPoints(demoDataPoints)
      setLoading(false)
    }, 600)
  }

  // Parse uploaded file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setErrorMsg(null)
    setFileName(file.name)

    const formData = new FormData()
    formData.append("sor_file", file)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiUrl}/api/v1/otdr/parse`, {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        throw new Error("API parsing failed or server offline")
      }

      const data = await res.json()
      if (data.status === "success") {
        setMetadata(data.metadata)
        setEvents(data.events)
        setDataPoints(data.data_points)
        if (data.message) {
          setErrorMsg(data.message) // Inform user if it's fallback mock
        }
      } else {
        throw new Error(data.message || "Failed to process SOR file")
      }
    } catch (err) {
      console.warn("FastAPI offline or parsing error, falling back to local simulation:", err)
      
      // Graceful client-side parsing fallback
      setTimeout(() => {
        setMetadata({
          ...demoMetadata,
          cable_id: file.name.split(".")[0].toUpperCase(),
          parsed_mode: "Local Emulated Parse (FastAPI Offline)"
        })
        setEvents(demoEvents)
        setDataPoints(demoDataPoints)
        setErrorMsg("Note: Backend API offline, loaded simulated trace preview.")
      }, 500)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-8 max-w-6xl print:p-0 print:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            OTDR Trace Viewer & Analyzer
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Upload Bellcore/Telcordia `.sor` files to view traces, examine connection events, and export PDF acceptance reports.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleLoadDemo}
            className="h-10 px-4 rounded-xl text-xs font-semibold border border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05] text-foreground transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Load Demo Trace
          </button>
        </div>
      </div>

      {/* File Upload Area */}
      {!metadata && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-dashed border-white/10 bg-card/20 p-12 text-center max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[300px] print:hidden"
        >
          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4 ring-4 ring-primary/5">
            <Upload className="h-6 w-6" />
          </div>
          <h3 className="text-base font-medium mb-1">Upload OTDR Trace File</h3>
          <p className="text-xs text-muted-foreground max-w-md mb-6 leading-relaxed">
            Drag and drop your standard `.sor` file here, or browse files. Max size 2MB.
          </p>
          <label className="h-10 px-6 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer inline-flex items-center gap-2">
            Browse Files
            <input
              type="file"
              accept=".sor"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </motion.div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="rounded-2xl border border-white/10 bg-card/20 p-12 text-center max-w-md mx-auto print:hidden">
          <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto mb-4" />
          <h3 className="text-sm font-medium mb-1">Parsing SOR File...</h3>
          <p className="text-xs text-muted-foreground">Reading Telcordia block structure and scaling trace points</p>
        </div>
      )}

      {/* Error/Notice Notification */}
      {errorMsg && metadata && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-xs text-amber-400 flex items-center gap-3 print:hidden max-w-5xl mx-auto">
          <ShieldAlert className="h-5 w-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Analysis Output Layout */}
      {metadata && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6 max-w-5xl mx-auto"
        >
          {/* Action Row */}
          <div className="flex justify-between items-center bg-card/30 border border-white/10 rounded-2xl p-4 print:hidden">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">{fileName}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="h-9 px-4 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Print / Export PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setMetadata(null)
                  setFileName(null)
                  setEvents([])
                  setDataPoints([])
                  setErrorMsg(null)
                }}
                className="h-9 px-4 rounded-xl text-xs font-semibold border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-foreground transition-all cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Printable Report Header */}
          <div className="hidden print:block border-b-2 border-neutral-800 pb-4 mb-4 text-black">
            <h2 className="text-xl font-bold">OTDR FIBER TEST REPORT</h2>
            <div className="text-xs text-neutral-600 mt-1">Generated via FTTH Tool (https://ftthtools.my.id)</div>
          </div>

          {/* Grid Layout: Metadata & Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Metadata Info Panel */}
            <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm space-y-4 print:border-neutral-300 print:text-black">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-white/10 pb-2 flex items-center gap-1.5 print:text-black print:border-neutral-300">
                <FileText className="h-4 w-4 text-primary print:text-black" />
                Trace Information
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-muted-foreground block print:text-neutral-500">Cable ID</span>
                  <span className="font-semibold text-foreground print:text-black">{metadata.cable_id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block print:text-neutral-500">Fiber Core ID</span>
                  <span className="font-semibold text-foreground print:text-black">{metadata.fiber_id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block print:text-neutral-500">Wavelength</span>
                  <span className="font-semibold text-foreground print:text-black">{metadata.wavelength}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground block print:text-neutral-500">Pulse Width</span>
                    <span className="font-semibold text-foreground print:text-black">{metadata.pulse_width}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block print:text-neutral-500">Refractive Index</span>
                    <span className="font-semibold text-foreground print:text-black">{metadata.index_refraction}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground block print:text-neutral-500">Test Date</span>
                    <span className="font-semibold text-foreground print:text-black">{metadata.date}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block print:text-neutral-500">Operator</span>
                    <span className="font-semibold text-foreground print:text-black">{metadata.operator}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/10 text-[10px] text-muted-foreground print:text-neutral-500 print:border-neutral-300">
                  Mode: {metadata.parsed_mode}
                </div>
              </div>
            </div>

            {/* Trace Graph Card */}
            <div className="md:col-span-2 rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm print:border-neutral-300 print:bg-white">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-white/10 pb-4 mb-4 flex items-center gap-1.5 print:text-black print:border-neutral-300">
                <LineChartIcon className="h-4 w-4 text-primary print:text-black" />
                Trace Curve (Distance vs dB)
              </h3>
              
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dataPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" className="print:stroke-neutral-200" />
                    <XAxis 
                      dataKey="distance" 
                      type="number" 
                      domain={[0, 'dataMax']} 
                      unit=" km"
                      tick={{ fontSize: 10, fill: '#888' }}
                      stroke="oklch(1 0 0 / 0.1)"
                    />
                    <YAxis 
                      unit=" dB"
                      tick={{ fontSize: 10, fill: '#888' }}
                      stroke="oklch(1 0 0 / 0.1)"
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#171717', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      labelStyle={{ color: '#fff', fontSize: 11 }}
                      itemStyle={{ color: 'var(--primary)', fontSize: 11 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="db" 
                      stroke="var(--primary)" 
                      strokeWidth={2}
                      dot={false}
                      className="print:stroke-black"
                    />
                    
                    {/* Render dots for events on chart */}
                    {events.map((evt) => {
                      // Find nearest data point to event distance
                      const point = dataPoints.reduce((prev, curr) => 
                        Math.abs(curr.distance - evt.distance) < Math.abs(prev.distance - evt.distance) ? curr : prev
                      , dataPoints[0] || { distance: 0, db: 0 })
                      
                      return (
                        <ReferenceDot 
                          key={evt.id} 
                          x={point.distance} 
                          y={point.db} 
                          r={4} 
                          fill="var(--primary)" 
                          stroke="#ffffff" 
                          strokeWidth={1}
                        />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Events List Table */}
          <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm print:border-neutral-300 print:bg-white print:text-black">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-white/10 pb-4 mb-4 flex items-center gap-1.5 print:text-black print:border-neutral-300">
              <TableIcon className="h-4 w-4 text-primary print:text-black" />
              Event Analysis Table
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground print:text-neutral-500 print:border-neutral-300">
                    <th className="py-2.5 font-medium">#</th>
                    <th className="py-2.5 font-medium">Event Type</th>
                    <th className="py-2.5 font-medium">Distance (km)</th>
                    <th className="py-2.5 font-medium">Step Loss (dB)</th>
                    <th className="py-2.5 font-medium">Reflectance (dB)</th>
                    <th className="py-2.5 font-medium">Fiber Slope (dB/km)</th>
                    <th className="py-2.5 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 print:divide-neutral-200">
                  {events.map((evt) => (
                    <tr key={evt.id} className="hover:bg-white/[0.01]">
                      <td className="py-3 font-semibold text-foreground print:text-black">{evt.id}</td>
                      <td className="py-3 font-medium text-foreground print:text-black">{evt.type}</td>
                      <td className="py-3 font-mono">{evt.distance.toFixed(3)} km</td>
                      <td className={`py-3 font-mono ${evt.loss > 0.1 ? "text-amber-400 font-semibold print:text-black" : "text-foreground print:text-black"}`}>
                        {evt.loss > 0 ? `-${evt.loss.toFixed(2)} dB` : "0.00 dB"}
                      </td>
                      <td className="py-3 font-mono">{evt.reflectance !== 0 ? `${evt.reflectance.toFixed(1)} dB` : "—"}</td>
                      <td className="py-3 font-mono">{evt.slope > 0 ? `${evt.slope.toFixed(2)} dB/km` : "—"}</td>
                      <td className="py-3 text-muted-foreground print:text-neutral-600">{evt.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
