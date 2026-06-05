"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { 
  Upload, 
  FileText, 
  LineChart as LineChartIcon, 
  Table as TableIcon, 
  Printer, 
  RefreshCw, 
  ShieldAlert,
  Sparkles,
  Layers
} from "lucide-react"
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  ReferenceLine,
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
  device: string
  fiber_type: string
  line_status: string
  trace_type: string
  backscatter: string
  acq_range: string
  resolution: string
  avg_time: string
  loss_thresh: string
  refl_thresh: string
  eof_thresh: string
  span_distance: string
  span_loss: string
  orl: string
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

interface TraceItem {
  filename: string
  metadata: OtdrMetadata
  events: OtdrEvent[]
  dataPoints: DataPoint[]
  message?: string
}

// Fallback/Demo Data matching the exact values of the reference image
const demoMetadata: OtdrMetadata = {
  cable_id: "GDG06 A14",
  fiber_id: "2",
  operator: "handler name",
  wavelength: "1310 nm",
  date: "04/04/26 12.58",
  pulse_width: "80 ns",
  index_refraction: "1,468",
  device: "FC4000",
  fiber_type: "ConventionalSmf",
  line_status: "AsBuilt",
  trace_type: "StandardTraceSingleFiber",
  backscatter: "-80 dB",
  acq_range: "4,18335 km",
  resolution: "0,255 m",
  avg_time: "15 s",
  loss_thresh: "0,200 dB",
  refl_thresh: "-40,000 dB",
  eof_thresh: "10,000 dB",
  span_distance: "1,79753 km",
  span_loss: "0,554 dB",
  orl: "24,447 dB",
  parsed_mode: "Simulated SOR Trace Preview"
}

const demoEvents: OtdrEvent[] = [
  { id: 0, type: "BeginOfFiber", distance: 0.00000, loss: 0.0, reflectance: -46.239, slope: 0.300, description: "Start position of fiber link" },
  { id: 1, type: "EndOfFiber", distance: 1.79753, loss: 0.0, reflectance: -61.863, slope: 0.308, description: "End position of fiber link" }
]

const demoDataPoints: DataPoint[] = []
for (let i = 0; i <= 150; i++) {
  const dist = (i / 150) * 2.2 
  let db = 0
  if (dist < 1.79753) {
    db = -45.0 - dist * 0.30
  } else {
    db = -56.5 + Math.sin(dist * 90) * 0.8
  }
  demoDataPoints.push({
    distance: Number(dist.toFixed(5)),
    db: Number(db.toFixed(2))
  })
}

export default function OtdrAnalyzerPage() {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  // Traces list state
  const [traces, setTraces] = useState<TraceItem[]>([])
  const [activeTraceIndex, setActiveTraceIndex] = useState<number>(0)
  
  // Dictionary of overrides: filename -> override distance string
  const [overrideDistances, setOverrideDistances] = useState<Record<string, string>>({})

  // Active trace helper
  const activeTrace = useMemo(() => {
    return traces[activeTraceIndex] || null
  }, [traces, activeTraceIndex])

  const activeFilename = activeTrace?.filename || null

  // Reset all states
  const handleReset = () => {
    setTraces([])
    setActiveTraceIndex(0)
    setErrorMsg(null)
    setOverrideDistances({})
  }

  // Load demo data
  const handleLoadDemo = () => {
    setLoading(true)
    setErrorMsg(null)
    setOverrideDistances({})
    setTimeout(() => {
      setTraces([
        {
          filename: "GDG06_A14.sor",
          metadata: demoMetadata,
          events: demoEvents,
          dataPoints: demoDataPoints
        }
      ])
      setActiveTraceIndex(0)
      setLoading(false)
    }, 400)
  }

  // Parse uploaded files (supports multiple selection and ZIP)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setLoading(true)
    setErrorMsg(null)
    setOverrideDistances({})

    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i])
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiUrl}/api/v1/otdr/parse-batch`, {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        throw new Error("API parsing failed or server offline")
      }

      const data = await res.json()
      if (data.status === "success" && data.results && data.results.length > 0) {
        const parsedTraces: TraceItem[] = data.results.map((r: any) => ({
          filename: r.filename,
          metadata: r.metadata,
          events: r.events,
          dataPoints: r.data_points,
          message: r.message
        }))
        setTraces(parsedTraces)
        setActiveTraceIndex(0)
        
        const failedFiles = parsedTraces.filter(t => t.message)
        if (failedFiles.length > 0) {
          setErrorMsg(`Note: ${failedFiles.length} file(s) failed parsing and fell back to demo trace template (e.g. ${failedFiles[0].filename}).`)
        }
      } else {
        throw new Error(data.message || "Failed to process SOR files")
      }
    } catch (err) {
      console.warn("FastAPI offline or parsing error, falling back to local simulation:", err)
      
      // Local fallback for each file
      const fallbackTraces: TraceItem[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        fallbackTraces.push({
          filename: file.name,
          metadata: {
            ...demoMetadata,
            cable_id: file.name.split(".")[0].toUpperCase(),
            parsed_mode: "Local Emulated Parse (FastAPI Offline)"
          },
          events: demoEvents,
          dataPoints: demoDataPoints,
          message: "API offline"
        })
      }
      
      // Sort alphabetically A-Z
      fallbackTraces.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }))
      
      setTraces(fallbackTraces)
      setActiveTraceIndex(0)
      setErrorMsg("Note: Backend API offline. Loaded emulated trace previews.")
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  // Active trace variables
  const activeOverrideDistance = useMemo(() => {
    if (!activeFilename) return ""
    return overrideDistances[activeFilename] || ""
  }, [overrideDistances, activeFilename])

  const handleOverrideChange = (val: string) => {
    if (!activeFilename) return
    setOverrideDistances((prev) => ({
      ...prev,
      [activeFilename]: val
    }))
  }

  // Helper to compile dynamic values for a given trace item
  const compileTraceData = (trace: TraceItem) => {
    const fileOverrideDist = overrideDistances[trace.filename] || ""
    const origSpanDist = parseFloat(trace.metadata.span_distance.replace(",", ".")) || 1.79753
    const spanDistOverride = fileOverrideDist ? (parseFloat(fileOverrideDist) || origSpanDist) : origSpanDist
    const scale = spanDistOverride / origSpanDist

    // Scale trace signal curve
    const adjDataPoints = trace.dataPoints.map((pt) => {
      if (pt.distance <= origSpanDist) {
        return {
          ...pt,
          distance: Number((pt.distance * scale).toFixed(5))
        }
      } else {
        return {
          ...pt,
          distance: Number((spanDistOverride + (pt.distance - origSpanDist) * scale).toFixed(5))
        }
      }
    })

    // Scale event positions
    const adjEvents = trace.events.map((evt) => {
      if (evt.type.includes("Begin") || evt.id === 0) {
        return evt
      }
      if (evt.type.includes("End") || evt.id === trace.events.length - 1 || evt.id === 1) {
        return {
          ...evt,
          distance: spanDistOverride
        }
      }
      return {
        ...evt,
        distance: Number((evt.distance * scale).toFixed(5))
      }
    })

    const mkrA = adjEvents.find((e) => e.type.includes("Begin") || e.id === 0)
    const mkrB = adjEvents.find((e) => e.type.includes("End") || e.id === adjEvents.length - 1 || e.id === 1)

    const dtA = mkrA && adjDataPoints.length > 0
      ? adjDataPoints.reduce((prev, curr) => 
          Math.abs(curr.distance - mkrA.distance) < Math.abs(prev.distance - mkrA.distance) ? curr : prev
        )
      : null

    const dtB = mkrB && adjDataPoints.length > 0
      ? adjDataPoints.reduce((prev, curr) => 
          Math.abs(curr.distance - mkrB.distance) < Math.abs(prev.distance - mkrB.distance) ? curr : prev
        )
      : null

    return {
      spanDistOverride,
      adjDataPoints,
      adjEvents,
      mkrA,
      mkrB,
      dtA,
      dtB
    }
  }

  // Active trace compiled parameters
  const activeCompiled = useMemo(() => {
    if (!activeTrace) return null
    return compileTraceData(activeTrace)
  }, [activeTrace, overrideDistances])

  return (
    <div className="space-y-8 max-w-6xl print:p-0 print:space-y-0 print:max-w-none print:bg-white print:text-black">
      {/* Header (Web only) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            OTDR Trace Analyzer
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Unggah file `.sor` tunggal, pilih beberapa file sekaligus, atau unggah folder `.zip` untuk melihat grafik dan mencetak PDF.
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

      {/* File Upload Area (Web only) */}
      {traces.length === 0 && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-dashed border-white/10 bg-card/20 p-12 text-center max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[300px] print:hidden"
        >
          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4 ring-4 ring-primary/5">
            <Upload className="h-6 w-6" />
          </div>
          <h3 className="text-base font-medium mb-1">Unggah File atau Folder OTDR</h3>
          <p className="text-xs text-muted-foreground max-w-md mb-6 leading-relaxed">
            Pilih satu file `.sor`, pilih banyak file sekaligus, atau unggah file `.zip` berisi kumpulan file `.sor`. File otomatis diurutkan A-Z.
          </p>
          <label className="h-10 px-6 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer inline-flex items-center gap-2">
            Pilih File / Zip
            <input
              type="file"
              accept=".sor,.zip"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </motion.div>
      )}

      {/* Loading State (Web only) */}
      {loading && (
        <div className="rounded-2xl border border-white/10 bg-card/20 p-12 text-center max-w-md mx-auto print:hidden">
          <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto mb-4" />
          <h3 className="text-sm font-medium mb-1">Memproses File SOR...</h3>
          <p className="text-xs text-muted-foreground">Membaca struktur blok Telcordia, menyaring redaman, dan mengurutkan A-Z</p>
        </div>
      )}

      {/* Notice Notification */}
      {errorMsg && traces.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-xs text-amber-400 flex items-center gap-3 print:hidden max-w-5xl mx-auto">
          <ShieldAlert className="h-5 w-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Analysis Output Layout (Web View) */}
      {traces.length > 0 && activeTrace && activeCompiled && !loading && (
        <div className="space-y-6 print:hidden">
          {/* Action Row */}
          <div className="flex justify-between items-center bg-card/30 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <Layers className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold truncate max-w-[250px] sm:max-w-md">
                {activeFilename}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="h-9 px-4 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Cetak Semua ({traces.length})
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="h-9 px-4 rounded-xl text-xs font-semibold border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-foreground transition-all cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Grid Layout: Sidebar Files + Active Report */}
          <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] gap-6 items-start">
            {/* Left Sidebar List of Files */}
            {traces.length > 1 && (
              <div className="bg-card/25 border border-white/10 rounded-2xl p-4 space-y-2 max-h-[600px] overflow-y-auto">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-2 flex items-center justify-between">
                  <span>Daftar File ({traces.length})</span>
                  <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono">A-Z</span>
                </div>
                <div className="space-y-1">
                  {traces.map((trace, idx) => {
                    const isActive = idx === activeTraceIndex
                    return (
                      <button
                        key={trace.filename}
                        type="button"
                        onClick={() => setActiveTraceIndex(idx)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all truncate flex items-center justify-between group ${
                          isActive
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "hover:bg-white/[0.04] text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="truncate flex-1">{trace.filename}</span>
                        {trace.message && (
                          <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${isActive ? 'bg-amber-600/30 text-amber-200' : 'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20'}`} title={trace.message}>
                            ⚠️
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Right: Active Single Report Content */}
            <div className="space-y-6">
              {/* Page 1 (Visual + Metadata) */}
              <div className="bg-white text-black p-6 rounded-2xl border border-neutral-200 shadow-sm">
                <div className="border-b-2 border-neutral-300 pb-4 mb-6 flex justify-between items-end">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-neutral-800">{activeTrace.metadata.cable_id}</h2>
                    <div className="text-[10px] text-neutral-500 font-mono mt-0.5">FTTH Tool — Modern Telecom Automation</div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black tracking-tighter text-blue-600">f<span className="text-neutral-800">tools</span></span>
                    <div className="h-1 bg-gradient-to-r from-blue-600 to-cyan-500 w-16 ml-auto mt-1" />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
                  {/* Trace Graph */}
                  <div className="space-y-4">
                    <div className="relative border border-neutral-200 rounded-xl p-3 bg-white">
                      <div className="absolute top-2 right-4 text-[9px] font-bold text-neutral-500 bg-neutral-100 border border-neutral-200 px-1 py-0.5 rounded">
                        km
                      </div>
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={activeCompiled.adjDataPoints} margin={{ top: 15, right: 15, left: -25, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                            <XAxis 
                              dataKey="distance" 
                              type="number" 
                              domain={[0, 'dataMax']} 
                              tick={{ fontSize: 9, fill: '#666', fontWeight: 600 }}
                              stroke="#ccc"
                            />
                            <YAxis 
                              domain={[-60, -10]}
                              tickCount={6}
                              tick={{ fontSize: 9, fill: '#666', fontWeight: 600 }}
                              stroke="#ccc"
                            />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', fontSize: 10 }}
                              labelStyle={{ fontWeight: 'bold' }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="db" 
                              stroke="#2563eb" 
                              strokeWidth={1.5}
                              dot={false}
                            />
                            
                            {activeCompiled.mkrA && (
                              <ReferenceLine 
                                x={activeCompiled.mkrA.distance} 
                                stroke="#ef4444" 
                                strokeWidth={1}
                                label={{ value: 'A', position: 'bottom', fill: '#ef4444', fontSize: 10, fontWeight: 'bold', offset: 10 }}
                              />
                            )}

                            {activeCompiled.mkrB && (
                              <ReferenceLine 
                                x={activeCompiled.mkrB.distance} 
                                stroke="#ef4444" 
                                strokeWidth={1}
                                label={{ value: 'B', position: 'bottom', fill: '#ef4444', fontSize: 10, fontWeight: 'bold', offset: 10 }}
                              />
                            )}

                            {activeCompiled.dtA && (
                              <ReferenceDot 
                                x={activeCompiled.dtA.distance} 
                                y={activeCompiled.dtA.db} 
                                r={3.5} 
                                fill="#eab308" 
                                stroke="#000" 
                                strokeWidth={1}
                              />
                            )}

                            {activeCompiled.dtB && (
                              <ReferenceDot 
                                x={activeCompiled.dtB.distance} 
                                y={activeCompiled.dtB.db} 
                                r={3.5} 
                                fill="#eab308" 
                                stroke="#000" 
                                strokeWidth={1}
                              />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="absolute bottom-12 left-4 text-[9px] font-bold text-neutral-500 bg-neutral-100 border border-neutral-200 px-1 py-0.5 rounded select-none">
                        dB
                      </div>
                    </div>

                    <div className="text-[10px] text-neutral-600 font-mono space-y-0.5 pl-2">
                      <div>A - SpanBegin</div>
                      <div>B - SpanEnd</div>
                    </div>
                  </div>

                  {/* Parameters list */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-neutral-800 border-l border-neutral-100 pl-4">
                    <div className="col-span-2 font-mono text-[10.5px] border-b border-neutral-200 pb-1 mb-1 grid grid-cols-2">
                      <div>{activeTrace.metadata.date}</div>
                      <div className="text-right">Wavelength: {activeTrace.metadata.wavelength}</div>
                    </div>

                    <div className="col-span-2 grid grid-cols-2 gap-x-2">
                      <div>Device: <span className="font-semibold">{activeTrace.metadata.device}</span></div>
                      <div>ID: <span className="font-semibold">0901001</span></div>
                    </div>

                    <div className="col-span-2 h-1" />

                    <div className="text-neutral-500">Cable ID:</div>
                    <div className="font-semibold text-right">{activeTrace.metadata.cable_id}</div>

                    <div className="text-neutral-500">Fiber ID:</div>
                    <div className="font-semibold text-right">{activeTrace.metadata.fiber_id}</div>

                    <div className="text-neutral-500">Fiber Type:</div>
                    <div className="font-semibold text-right">{activeTrace.metadata.fiber_type}</div>

                    <div className="text-neutral-500">Originating Location:</div>
                    <div className="font-semibold text-right">start position</div>

                    <div className="text-neutral-500">Terminating Location:</div>
                    <div className="font-semibold text-right">end position</div>

                    <div className="text-neutral-500">Line Status:</div>
                    <div className="font-semibold text-right">{activeTrace.metadata.line_status}</div>

                    <div className="text-neutral-500">Trace Type:</div>
                    <div className="font-semibold text-right">{activeTrace.metadata.trace_type}</div>

                    <div className="text-neutral-500">Operator:</div>
                    <div className="font-semibold text-right">{activeTrace.metadata.operator}</div>

                    <div className="text-neutral-500">Comment:</div>
                    <div className="font-semibold text-right">—</div>

                    <div className="col-span-2 border-t border-neutral-100 my-1" />

                    <div className="text-neutral-500">Refractive Index:</div>
                    <div className="font-mono text-right">{activeTrace.metadata.index_refraction}</div>

                    <div className="text-neutral-500">Backscatter coef.:</div>
                    <div className="font-mono text-right">{activeTrace.metadata.backscatter}</div>

                    <div className="text-neutral-500">Acquisition Range:</div>
                    <div className="font-mono text-right">{activeTrace.metadata.acq_range}</div>

                    <div className="text-neutral-500">First data point:</div>
                    <div className="font-mono text-right">0,00000 km</div>

                    <div className="text-neutral-500">Last data point:</div>
                    <div className="font-mono text-right">{activeTrace.metadata.acq_range}</div>

                    <div className="text-neutral-500">Sampling Resolution:</div>
                    <div className="font-mono text-right">{activeTrace.metadata.resolution}</div>

                    <div className="text-neutral-500">Pulse Width:</div>
                    <div className="font-mono text-right">{activeTrace.metadata.pulse_width}</div>

                    <div className="col-span-2 border-t border-neutral-100 my-1" />

                    <div className="text-neutral-500">Averaging Time:</div>
                    <div className="font-mono text-right">{activeTrace.metadata.avg_time}</div>

                    <div className="text-neutral-500">Event Loss Threshold:</div>
                    <div className="font-mono text-right">{activeTrace.metadata.loss_thresh}</div>

                    <div className="text-neutral-500">Reflectance Threshold:</div>
                    <div className="font-mono text-right">{activeTrace.metadata.refl_thresh}</div>

                    <div className="text-neutral-500">End of Fiber Threshold:</div>
                    <div className="font-mono text-right">{activeTrace.metadata.eof_thresh}</div>

                    <div className="col-span-2 border-t border-neutral-200 border-dashed my-1" />

                    <div className="font-bold text-neutral-900">Span distance:</div>
                    <div className="font-bold text-right text-neutral-900 font-mono">
                      {activeCompiled.spanDistOverride.toFixed(5).replace(".", ",")} km
                    </div>

                    <div className="font-bold text-neutral-900">Span loss:</div>
                    <div className="font-bold text-right text-neutral-900 font-mono">{activeTrace.metadata.span_loss}</div>

                    <div className="font-bold text-neutral-900">ORL:</div>
                    <div className="font-bold text-right text-neutral-900 font-mono">{activeTrace.metadata.orl}</div>

                    <div className="col-span-2 border-t border-neutral-200 border-dashed my-2" />

                    {/* Override Input Box */}
                    <div className="col-span-2 space-y-1.5">
                      <label className="text-[9.5px] font-bold uppercase tracking-wider text-primary">Override Cable Length (km)</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.00001"
                          placeholder={parseFloat(activeTrace.metadata.span_distance.replace(",", ".")).toFixed(5)}
                          value={activeOverrideDistance}
                          onChange={(e) => handleOverrideChange(e.target.value)}
                          className="flex-1 h-8 px-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-[11px] font-mono text-black focus:outline-none focus:border-primary"
                        />
                        {activeOverrideDistance && (
                          <button
                            type="button"
                            onClick={() => handleOverrideChange("")}
                            className="h-8 px-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-[10px] font-semibold text-neutral-600 transition-colors cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Page 2 (Event Table) */}
              <div className="bg-white text-black p-6 rounded-2xl border border-neutral-200 shadow-sm">
                <div className="border-b-2 border-neutral-300 pb-4 mb-6 flex justify-between items-end">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-neutral-800">{activeTrace.metadata.cable_id}</h2>
                    <div className="text-[10px] text-neutral-500 font-mono mt-0.5">FTTH Tool — Modern Telecom Automation</div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black tracking-tighter text-blue-600">f<span className="text-neutral-800">tools</span></span>
                    <div className="h-1 bg-gradient-to-r from-blue-600 to-cyan-500 w-16 ml-auto mt-1" />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-neutral-300 text-neutral-600">
                        <th className="py-2.5 font-semibold text-neutral-800">#</th>
                        <th className="py-2.5 font-semibold text-neutral-800">Status</th>
                        <th className="py-2.5 font-semibold text-neutral-800">Distance, km</th>
                        <th className="py-2.5 font-semibold text-neutral-800">Splice loss, dB</th>
                        <th className="py-2.5 font-semibold text-neutral-800">Reflectance, dB</th>
                        <th className="py-2.5 font-semibold text-neutral-800">Of loss, dB/km</th>
                        <th className="py-2.5 font-semibold text-neutral-800">Cumulative loss, dB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 text-neutral-700">
                      {activeCompiled.adjEvents.map((evt) => {
                        const isBegin = evt.type === "BeginOfFiber"
                        const isEnd = evt.type === "EndOfFiber"
                        
                        let idLabel = `${evt.id}`
                        if (isBegin) idLabel = "0 (A)"
                        if (isEnd) idLabel = "1 (B)"

                        return (
                          <tr key={evt.id} className="hover:bg-neutral-50">
                            <td className="py-3 font-semibold text-neutral-900">{idLabel}</td>
                            <td className="py-3 font-medium text-neutral-900 font-mono">{evt.type}</td>
                            <td className="py-3 font-mono">
                              {evt.distance.toFixed(5).replace(".", ",")}
                            </td>
                            <td className="py-3 font-mono text-neutral-500">
                              {(!isBegin && !isEnd && evt.loss > 0) ? `-${evt.loss.toFixed(3).replace(".", ",")}` : "—"}
                            </td>
                            <td className="py-3 font-mono">
                              {evt.reflectance !== 0 ? `${evt.reflectance.toFixed(3).replace(".", ",")}` : "—"}
                            </td>
                            <td className="py-3 font-mono">
                              {evt.slope > 0 ? `${evt.slope.toFixed(3).replace(".", ",")}` : "—"}
                            </td>
                            <td className="py-3 font-mono">
                              {isEnd ? activeTrace.metadata.span_loss : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-12 pt-6 border-t border-neutral-200 text-[10px] text-neutral-400 font-mono text-center">
                  Acceptance Test Report Generated Automatically via ftthtools.my.id
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Print View Only (Hidden on Web, Visible during window.print()) */}
      {traces.length > 0 && (
        <div className="hidden print:block space-y-0 bg-white text-black p-0">
          {traces.map((trace) => {
            const compiled = compileTraceData(trace)
            return (
              <div 
                key={trace.filename} 
                className="space-y-0 print:space-y-0"
                style={{ pageBreakAfter: "always", breakAfter: "page" }}
              >
                {/* Print Page 1 */}
                <div className="p-0 bg-white text-black min-h-screen flex flex-col justify-between" style={{ pageBreakInside: "avoid" }}>
                  <div>
                    <div className="border-b-2 border-neutral-300 pb-4 mb-6 flex justify-between items-end">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-neutral-800">{trace.metadata.cable_id}</h2>
                        <div className="text-[10px] text-neutral-500 font-mono mt-0.5">FTTH Tool — Modern Telecom Automation</div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black tracking-tighter text-blue-600">f<span className="text-neutral-800">tools</span></span>
                        <div className="h-1 bg-gradient-to-r from-blue-600 to-cyan-500 w-16 ml-auto mt-1" />
                      </div>
                    </div>

                    <div className="grid grid-cols-[1.3fr_1fr] gap-4 items-start">
                      {/* Graph */}
                      <div className="space-y-4">
                        <div className="relative border border-neutral-200 rounded-xl p-3 bg-white">
                          <div className="absolute top-2 right-4 text-[9px] font-bold text-neutral-500 bg-neutral-100 border border-neutral-200 px-1 py-0.5 rounded">
                            km
                          </div>
                          <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={compiled.adjDataPoints} margin={{ top: 15, right: 15, left: -25, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                                <XAxis 
                                  dataKey="distance" 
                                  type="number" 
                                  domain={[0, 'dataMax']} 
                                  tick={{ fontSize: 9, fill: '#666', fontWeight: 600 }}
                                  stroke="#ccc"
                                />
                                <YAxis 
                                  domain={[-60, -10]}
                                  tickCount={6}
                                  tick={{ fontSize: 9, fill: '#666', fontWeight: 600 }}
                                  stroke="#ccc"
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="db" 
                                  stroke="#2563eb" 
                                  strokeWidth={1.5}
                                  dot={false}
                                />
                                
                                {compiled.mkrA && (
                                  <ReferenceLine 
                                    x={compiled.mkrA.distance} 
                                    stroke="#ef4444" 
                                    strokeWidth={1}
                                    label={{ value: 'A', position: 'bottom', fill: '#ef4444', fontSize: 10, fontWeight: 'bold', offset: 10 }}
                                  />
                                )}

                                {compiled.mkrB && (
                                  <ReferenceLine 
                                    x={compiled.mkrB.distance} 
                                    stroke="#ef4444" 
                                    strokeWidth={1}
                                    label={{ value: 'B', position: 'bottom', fill: '#ef4444', fontSize: 10, fontWeight: 'bold', offset: 10 }}
                                  />
                                )}

                                {compiled.dtA && (
                                  <ReferenceDot 
                                    x={compiled.dtA.distance} 
                                    y={compiled.dtA.db} 
                                    r={3.5} 
                                    fill="#eab308" 
                                    stroke="#000" 
                                    strokeWidth={1}
                                  />
                                )}

                                {compiled.dtB && (
                                  <ReferenceDot 
                                    x={compiled.dtB.distance} 
                                    y={compiled.dtB.db} 
                                    r={3.5} 
                                    fill="#eab308" 
                                    stroke="#000" 
                                    strokeWidth={1}
                                  />
                                )}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="absolute bottom-12 left-4 text-[9px] font-bold text-neutral-500 bg-neutral-100 border border-neutral-200 px-1 py-0.5 rounded select-none">
                            dB
                          </div>
                        </div>

                        <div className="text-[10px] text-neutral-600 font-mono space-y-0.5 pl-2">
                          <div>A - SpanBegin</div>
                          <div>B - SpanEnd</div>
                        </div>
                      </div>

                      {/* Params */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-neutral-800 border-l border-neutral-100 pl-3">
                        <div className="col-span-2 font-mono text-[10.5px] border-b border-neutral-200 pb-1 mb-1 grid grid-cols-2">
                          <div>{trace.metadata.date}</div>
                          <div className="text-right">Wavelength: {trace.metadata.wavelength}</div>
                        </div>

                        <div className="col-span-2 grid grid-cols-2 gap-x-2">
                          <div>Device: <span className="font-semibold">{trace.metadata.device}</span></div>
                          <div>ID: <span className="font-semibold">0901001</span></div>
                        </div>

                        <div className="col-span-2 h-1" />

                        <div className="text-neutral-500">Cable ID:</div>
                        <div className="font-semibold text-right">{trace.metadata.cable_id}</div>

                        <div className="text-neutral-500">Fiber ID:</div>
                        <div className="font-semibold text-right">{trace.metadata.fiber_id}</div>

                        <div className="text-neutral-500">Fiber Type:</div>
                        <div className="font-semibold text-right">{trace.metadata.fiber_type}</div>

                        <div className="text-neutral-500">Originating Location:</div>
                        <div className="font-semibold text-right">start position</div>

                        <div className="text-neutral-500">Terminating Location:</div>
                        <div className="font-semibold text-right">end position</div>

                        <div className="text-neutral-500">Line Status:</div>
                        <div className="font-semibold text-right">{trace.metadata.line_status}</div>

                        <div className="text-neutral-500">Trace Type:</div>
                        <div className="font-semibold text-right">{trace.metadata.trace_type}</div>

                        <div className="text-neutral-500">Operator:</div>
                        <div className="font-semibold text-right">{trace.metadata.operator}</div>

                        <div className="text-neutral-500">Comment:</div>
                        <div className="font-semibold text-right">—</div>

                        <div className="col-span-2 border-t border-neutral-100 my-1" />

                        <div className="text-neutral-500">Refractive Index:</div>
                        <div className="font-mono text-right">{trace.metadata.index_refraction}</div>

                        <div className="text-neutral-500">Backscatter coef.:</div>
                        <div className="font-mono text-right">{trace.metadata.backscatter}</div>

                        <div className="text-neutral-500">Acquisition Range:</div>
                        <div className="font-mono text-right">{trace.metadata.acq_range}</div>

                        <div className="text-neutral-500">First data point:</div>
                        <div className="font-mono text-right">0,00000 km</div>

                        <div className="text-neutral-500">Last data point:</div>
                        <div className="font-mono text-right">{trace.metadata.acq_range}</div>

                        <div className="text-neutral-500">Sampling Resolution:</div>
                        <div className="font-mono text-right">{trace.metadata.resolution}</div>

                        <div className="text-neutral-500">Pulse Width:</div>
                        <div className="font-mono text-right">{trace.metadata.pulse_width}</div>

                        <div className="col-span-2 border-t border-neutral-100 my-1" />

                        <div className="text-neutral-500">Averaging Time:</div>
                        <div className="font-mono text-right">{trace.metadata.avg_time}</div>

                        <div className="text-neutral-500">Event Loss Threshold:</div>
                        <div className="font-mono text-right">{trace.metadata.loss_thresh}</div>

                        <div className="text-neutral-500">Reflectance Threshold:</div>
                        <div className="font-mono text-right">{trace.metadata.refl_thresh}</div>

                        <div className="text-neutral-500">End of Fiber Threshold:</div>
                        <div className="font-mono text-right">{trace.metadata.eof_thresh}</div>

                        <div className="col-span-2 border-t border-neutral-200 border-dashed my-1" />

                        <div className="font-bold text-neutral-900">Span distance:</div>
                        <div className="font-bold text-right text-neutral-900 font-mono">
                          {compiled.spanDistOverride.toFixed(5).replace(".", ",")} km
                        </div>

                        <div className="font-bold text-neutral-900">Span loss:</div>
                        <div className="font-bold text-right text-neutral-900 font-mono">{trace.metadata.span_loss}</div>

                        <div className="font-bold text-neutral-900">ORL:</div>
                        <div className="font-bold text-right text-neutral-900 font-mono">{trace.metadata.orl}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Print Page 2 */}
                <div 
                  className="p-0 bg-white text-black min-h-screen flex flex-col justify-between" 
                  style={{ pageBreakBefore: "always", breakBefore: "page", pageBreakInside: "avoid" }}
                >
                  <div>
                    <div className="border-b-2 border-neutral-300 pb-4 mb-6 flex justify-between items-end">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-neutral-800">{trace.metadata.cable_id}</h2>
                        <div className="text-[10px] text-neutral-500 font-mono mt-0.5">FTTH Tool — Modern Telecom Automation</div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black tracking-tighter text-blue-600">f<span className="text-neutral-800">tools</span></span>
                        <div className="h-1 bg-gradient-to-r from-blue-600 to-cyan-500 w-16 ml-auto mt-1" />
                      </div>
                    </div>

                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b-2 border-neutral-300 text-neutral-600">
                          <th className="py-2.5 font-semibold text-neutral-800">#</th>
                          <th className="py-2.5 font-semibold text-neutral-800">Status</th>
                          <th className="py-2.5 font-semibold text-neutral-800">Distance, km</th>
                          <th className="py-2.5 font-semibold text-neutral-800">Splice loss, dB</th>
                          <th className="py-2.5 font-semibold text-neutral-800">Reflectance, dB</th>
                          <th className="py-2.5 font-semibold text-neutral-800">Of loss, dB/km</th>
                          <th className="py-2.5 font-semibold text-neutral-800">Cumulative loss, dB</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 text-neutral-700">
                        {compiled.adjEvents.map((evt) => {
                          const isBegin = evt.type === "BeginOfFiber"
                          const isEnd = evt.type === "EndOfFiber"
                          
                          let idLabel = `${evt.id}`
                          if (isBegin) idLabel = "0 (A)"
                          if (isEnd) idLabel = "1 (B)"

                          return (
                            <tr key={evt.id}>
                              <td className="py-3 font-semibold text-neutral-900">{idLabel}</td>
                              <td className="py-3 font-medium text-neutral-900 font-mono">{evt.type}</td>
                              <td className="py-3 font-mono">
                                {evt.distance.toFixed(5).replace(".", ",")}
                              </td>
                              <td className="py-3 font-mono text-neutral-500">
                                {(!isBegin && !isEnd && evt.loss > 0) ? `-${evt.loss.toFixed(3).replace(".", ",")}` : "—"}
                              </td>
                              <td className="py-3 font-mono">
                                {evt.reflectance !== 0 ? `${evt.reflectance.toFixed(3).replace(".", ",")}` : "—"}
                              </td>
                              <td className="py-3 font-mono">
                                {evt.slope > 0 ? `${evt.slope.toFixed(3).replace(".", ",")}` : "—"}
                              </td>
                              <td className="py-3 font-mono">
                                {isEnd ? trace.metadata.span_loss : "—"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-12 pt-6 border-t border-neutral-200 text-[10px] text-neutral-400 font-mono text-center">
                    Acceptance Test Report Generated Automatically via ftthtools.my.id
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
