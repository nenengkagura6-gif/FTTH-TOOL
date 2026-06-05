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
// Generate 150 points representing a clean, stable trace of ~1.8km
for (let i = 0; i <= 150; i++) {
  const dist = (i / 150) * 2.2 // Draw slightly past the 1.8km end
  let db = 0

  if (dist < 1.79753) {
    // Normal flat fiber attenuation slope (about 0.30 dB/km)
    db = -45.0 - dist * 0.30
  } else {
    // Sharp drop off to the noise level (-58 dB) after 1.8 km
    db = -56.5 + Math.sin(dist * 90) * 0.8
  }

  demoDataPoints.push({
    distance: Number(dist.toFixed(5)),
    db: Number(db.toFixed(2))
  })
}

export default function OtdrAnalyzerPage() {
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<OtdrMetadata | null>(null)
  const [events, setEvents] = useState<OtdrEvent[]>([])
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Cable Length Edit Override States
  const [overrideDistance, setOverrideDistance] = useState<string>("")
  const [isEditingDistance, setIsEditingDistance] = useState<boolean>(false)

  // Reset all states
  const handleReset = () => {
    setMetadata(null)
    setFileName(null)
    setEvents([])
    setDataPoints([])
    setErrorMsg(null)
    setOverrideDistance("")
    setIsEditingDistance(false)
  }

  // Load demo data
  const handleLoadDemo = () => {
    setLoading(true)
    setErrorMsg(null)
    setOverrideDistance("")
    setIsEditingDistance(false)
    setTimeout(() => {
      setFileName("GDG06_A14.sor")
      setMetadata(demoMetadata)
      setEvents(demoEvents)
      setDataPoints(demoDataPoints)
      setLoading(false)
    }, 400)
  }

  // Parse uploaded file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setErrorMsg(null)
    setFileName(file.name)
    setOverrideDistance("")
    setIsEditingDistance(false)

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
          setErrorMsg(data.message)
        }
      } else {
        throw new Error(data.message || "Failed to process SOR file")
      }
    } catch (err) {
      console.warn("FastAPI offline or parsing error, falling back to local simulation:", err)
      
      // Fallback
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

  // Resolve calculations based on length overrides
  const spanDistanceOverride = useMemo(() => {
    if (!metadata) return 0
    const parsedOrig = parseFloat(metadata.span_distance.replace(",", ".")) || 1.79753
    if (!overrideDistance) return parsedOrig
    const parsedOverride = parseFloat(overrideDistance)
    return isNaN(parsedOverride) ? parsedOrig : parsedOverride
  }, [overrideDistance, metadata])

  // Scale the trace curve dynamically so the drop-off aligns with the new SpanEnd B distance!
  const adjustedDataPoints = useMemo(() => {
    if (!metadata || dataPoints.length === 0) return []
    const origSpanDist = parseFloat(metadata.span_distance.replace(",", ".")) || 1.79753
    const scale = spanDistanceOverride / origSpanDist

    return dataPoints.map((pt) => {
      if (pt.distance <= origSpanDist) {
        return {
          ...pt,
          distance: Number((pt.distance * scale).toFixed(5))
        }
      } else {
        return {
          ...pt,
          distance: Number((spanDistanceOverride + (pt.distance - origSpanDist) * scale).toFixed(5))
        }
      }
    })
  }, [dataPoints, spanDistanceOverride, metadata])

  // Scale/Adjust events distances
  const adjustedEvents = useMemo(() => {
    if (!metadata || events.length === 0) return []
    const origSpanDist = parseFloat(metadata.span_distance.replace(",", ".")) || 1.79753
    const scale = spanDistanceOverride / origSpanDist

    return events.map((evt) => {
      // BeginOfFiber always stays at 0
      if (evt.type.includes("Begin") || evt.id === 0) {
        return evt
      }
      // EndOfFiber snaps exactly to spanDistanceOverride
      if (evt.type.includes("End") || evt.id === events.length - 1 || evt.id === 1) {
        return {
          ...evt,
          distance: spanDistanceOverride
        }
      }
      // Intermediate events scale linearly
      return {
        ...evt,
        distance: Number((evt.distance * scale).toFixed(5))
      }
    })
  }, [events, spanDistanceOverride, metadata])

  // Calculate coordinates for Marker dots A and B on the scaled line
  const markerA = adjustedEvents.find((e) => e.type.includes("Begin") || e.id === 0)
  const markerB = adjustedEvents.find((e) => e.type.includes("End") || e.id === adjustedEvents.length - 1 || e.id === 1)

  const dotA = markerA && adjustedDataPoints.length > 0
    ? adjustedDataPoints.reduce((prev, curr) => 
        Math.abs(curr.distance - markerA.distance) < Math.abs(prev.distance - markerA.distance) ? curr : prev
      )
    : null

  const dotB = markerB && adjustedDataPoints.length > 0
    ? adjustedDataPoints.reduce((prev, curr) => 
        Math.abs(curr.distance - markerB.distance) < Math.abs(prev.distance - markerB.distance) ? curr : prev
      )
    : null

  return (
    <div className="space-y-8 max-w-6xl print:p-0 print:space-y-4 print:max-w-none print:bg-white">
      {/* Header (Web only) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            OTDR Trace Analyzer
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Analyze, visualize, and generate professional PDF reports for standard `.sor` OTDR trace files.
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

      {/* Loading State (Web only) */}
      {loading && (
        <div className="rounded-2xl border border-white/10 bg-card/20 p-12 text-center max-w-md mx-auto print:hidden">
          <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto mb-4" />
          <h3 className="text-sm font-medium mb-1">Parsing SOR File...</h3>
          <p className="text-xs text-muted-foreground">Reading Telcordia block structure and scaling trace points</p>
        </div>
      )}

      {/* Notice Notification */}
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
          className="space-y-6 max-w-6xl mx-auto print:space-y-4"
        >
          {/* Action Row (Web only) */}
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
                onClick={handleReset}
                className="h-9 px-4 rounded-xl text-xs font-semibold border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-foreground transition-all cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Page 1 Container (Visual + Metadata) */}
          <div className="bg-white text-black p-6 rounded-2xl border border-neutral-200 shadow-sm print:shadow-none print:border-none print:p-0">
            {/* Header Banner (VeEX styled) */}
            <div className="border-b-2 border-neutral-300 pb-4 mb-6 flex justify-between items-end">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-neutral-800">{metadata.cable_id || "OTDR TRACE"}</h2>
                <div className="text-[10px] text-neutral-500 font-mono mt-0.5">FTTH Tool — Modern Telecom Automation</div>
              </div>
              <div className="text-right">
                <span className="text-lg font-black tracking-tighter text-blue-600">Ve<span className="text-neutral-800">EX</span></span>
                <div className="h-1 bg-gradient-to-r from-blue-600 to-cyan-500 w-16 ml-auto mt-1" />
              </div>
            </div>

            {/* Layout Grid: Graph on Left, Parameters on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6 print:grid-cols-[1.3fr_1fr] print:gap-4 items-start">
              {/* Left Column: Trace Graph */}
              <div className="space-y-4">
                <div className="relative border border-neutral-200 rounded-xl p-3 bg-white">
                  <div className="absolute top-2 right-4 text-[9px] font-bold text-neutral-500 bg-neutral-100 border border-neutral-200 px-1 py-0.5 rounded">
                    km
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={adjustedDataPoints} margin={{ top: 15, right: 15, left: -25, bottom: 5 }}>
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
                        
                        {/* Red Marker A */}
                        {markerA && (
                          <ReferenceLine 
                            x={markerA.distance} 
                            stroke="#ef4444" 
                            strokeWidth={1}
                            label={{ value: 'A', position: 'bottom', fill: '#ef4444', fontSize: 10, fontWeight: 'bold', offset: 10 }}
                          />
                        )}

                        {/* Red Marker B */}
                        {markerB && (
                          <ReferenceLine 
                            x={markerB.distance} 
                            stroke="#ef4444" 
                            strokeWidth={1}
                            label={{ value: 'B', position: 'bottom', fill: '#ef4444', fontSize: 10, fontWeight: 'bold', offset: 10 }}
                          />
                        )}

                        {/* Yellow Dot A */}
                        {dotA && (
                          <ReferenceDot 
                            x={dotA.distance} 
                            y={dotA.db} 
                            r={3.5} 
                            fill="#eab308" 
                            stroke="#000" 
                            strokeWidth={1}
                          />
                        )}

                        {/* Yellow Dot B */}
                        {dotB && (
                          <ReferenceDot 
                            x={dotB.distance} 
                            y={dotB.db} 
                            r={3.5} 
                            fill="#eab308" 
                            stroke="#000" 
                            strokeWidth={1}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {/* db label at bottom left */}
                  <div className="absolute bottom-12 left-4 text-[9px] font-bold text-neutral-500 bg-neutral-100 border border-neutral-200 px-1 py-0.5 rounded select-none">
                    dB
                  </div>
                </div>

                {/* Sub Labels under Chart */}
                <div className="text-[10px] text-neutral-600 font-mono space-y-0.5 pl-2">
                  <div>A - SpanBegin</div>
                  <div>B - SpanEnd</div>
                </div>
              </div>

              {/* Right Column: Parameters List */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-neutral-800 border-l border-neutral-100 pl-4 print:border-l print:pl-3">
                {/* Header info */}
                <div className="col-span-2 font-mono text-[10.5px] border-b border-neutral-200 pb-1 mb-1 grid grid-cols-2">
                  <div>{metadata.date}</div>
                  <div className="text-right">Wavelength: {metadata.wavelength}</div>
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-x-2">
                  <div>Device: <span className="font-semibold">{metadata.device}</span></div>
                  <div>ID: <span className="font-semibold">0901001</span></div>
                </div>

                <div className="col-span-2 h-1" />

                {/* Table items */}
                <div className="text-neutral-500">Cable ID:</div>
                <div className="font-semibold text-right">{metadata.cable_id}</div>

                <div className="text-neutral-500">Fiber ID:</div>
                <div className="font-semibold text-right">{metadata.fiber_id}</div>

                <div className="text-neutral-500">Fiber Type:</div>
                <div className="font-semibold text-right">{metadata.fiber_type}</div>

                <div className="text-neutral-500">Originating Location:</div>
                <div className="font-semibold text-right">start position</div>

                <div className="text-neutral-500">Terminating Location:</div>
                <div className="font-semibold text-right">end position</div>

                <div className="text-neutral-500">Line Status:</div>
                <div className="font-semibold text-right">{metadata.line_status}</div>

                <div className="text-neutral-500">Trace Type:</div>
                <div className="font-semibold text-right">{metadata.trace_type}</div>

                <div className="text-neutral-500">Operator:</div>
                <div className="font-semibold text-right">{metadata.operator}</div>

                <div className="text-neutral-500">Comment:</div>
                <div className="font-semibold text-right">—</div>

                <div className="col-span-2 border-t border-neutral-100 my-1" />

                <div className="text-neutral-500">Refractive Index:</div>
                <div className="font-mono text-right">{metadata.index_refraction}</div>

                <div className="text-neutral-500">Backscatter coef.:</div>
                <div className="font-mono text-right">{metadata.backscatter}</div>

                <div className="text-neutral-500">Acquisition Range:</div>
                <div className="font-mono text-right">{metadata.acq_range}</div>

                <div className="text-neutral-500">First data point:</div>
                <div className="font-mono text-right">0,00000 km</div>

                <div className="text-neutral-500">Last data point:</div>
                <div className="font-mono text-right">{metadata.acq_range}</div>

                <div className="text-neutral-500">Sampling Resolution:</div>
                <div className="font-mono text-right">{metadata.resolution}</div>

                <div className="text-neutral-500">Pulse Width:</div>
                <div className="font-mono text-right">{metadata.pulse_width}</div>

                <div className="col-span-2 border-t border-neutral-100 my-1" />

                <div className="text-neutral-500">Averaging Time:</div>
                <div className="font-mono text-right">{metadata.avg_time}</div>

                <div className="text-neutral-500">Event Loss Threshold:</div>
                <div className="font-mono text-right">{metadata.loss_thresh}</div>

                <div className="text-neutral-500">Reflectance Threshold:</div>
                <div className="font-mono text-right">{metadata.refl_thresh}</div>

                <div className="text-neutral-500">End of Fiber Threshold:</div>
                <div className="font-mono text-right">{metadata.eof_thresh}</div>

                <div className="col-span-2 border-t border-neutral-200 border-dashed my-1" />

                {/* Bold Key Metrics - Now Editable */}
                <div className="font-bold text-neutral-900">Span distance:</div>
                <div className="font-bold text-right text-neutral-900 flex items-center justify-end gap-1.5">
                  {isEditingDistance ? (
                    <div className="flex items-center gap-1 print:hidden">
                      <input
                        type="text"
                        value={overrideDistance}
                        onChange={(e) => setOverrideDistance(e.target.value)}
                        onBlur={() => setIsEditingDistance(false)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setIsEditingDistance(false)
                        }}
                        className="w-20 px-1.5 py-0.5 border border-neutral-300 rounded text-[9.5px] font-mono text-right text-black focus:outline-none"
                        autoFocus
                      />
                      <span className="text-[10px]">km</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOverrideDistance(spanDistanceOverride.toFixed(5))
                        setIsEditingDistance(true)
                      }}
                      className="cursor-pointer hover:underline hover:text-primary flex items-center gap-1 group print:cursor-auto print:hover:no-underline text-left"
                      title="Click to edit distance"
                    >
                      {spanDistanceOverride.toFixed(5).replace(".", ",")} km
                      <span className="text-[9px] text-neutral-400 group-hover:text-primary print:hidden">✏️</span>
                    </button>
                  )}
                </div>

                <div className="font-bold text-neutral-900">Span loss:</div>
                <div className="font-bold text-right text-neutral-900">{metadata.span_loss}</div>

                <div className="font-bold text-neutral-900">ORL:</div>
                <div className="font-bold text-right text-neutral-900">{metadata.orl}</div>
              </div>
            </div>
          </div>

          {/* Page break for printing to separate the table onto page 2 */}
          <div className="print:page-break-before" />

          {/* Page 2 Container (Event Table) */}
          <div className="bg-white text-black p-6 rounded-2xl border border-neutral-200 shadow-sm print:shadow-none print:border-none print:p-0">
            {/* Header Banner (Page 2) */}
            <div className="border-b-2 border-neutral-300 pb-4 mb-6 flex justify-between items-end">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-neutral-800">{metadata.cable_id || "OTDR TRACE"} — EVENT ANALYSIS</h2>
                <div className="text-[10px] text-neutral-500 font-mono mt-0.5">FTTH Tool — Modern Telecom Automation</div>
              </div>
              <div className="text-right">
                <span className="text-lg font-black tracking-tighter text-blue-600">Ve<span className="text-neutral-800">EX</span></span>
                <div className="h-1 bg-gradient-to-r from-blue-600 to-cyan-500 w-16 ml-auto mt-1" />
              </div>
            </div>

            {/* Event Analysis Table */}
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
                  {adjustedEvents.map((evt) => {
                    const isBegin = evt.type === "BeginOfFiber"
                    const isEnd = evt.type === "EndOfFiber"
                    
                    // Format index/labels
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
                          {/* Calculate cumulative loss representation if EndOfFiber */}
                          {isEnd ? metadata.span_loss : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Report Footer */}
            <div className="mt-12 pt-6 border-t border-neutral-200 text-[10px] text-neutral-400 font-mono text-center">
              Acceptance Test Report Generated Automatically via ftthtools.my.id
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
