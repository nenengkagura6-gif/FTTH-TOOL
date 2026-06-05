"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { Activity, ShieldAlert, CheckCircle, Info, Sparkles, HelpCircle } from "lucide-react"

// Wavelength configurations with default attenuation loss (dB/km)
const wavelengths = [
  { value: 1310, label: "1310 nm (GPON Upstream / OTDR)", lossPerKm: 0.35 },
  { value: 1490, label: "1490 nm (GPON Downstream)", lossPerKm: 0.23 },
  { value: 1550, label: "1550 nm (CATV / RF Overlay)", lossPerKm: 0.20 },
  { value: 1577, label: "1577 nm (XGS-PON Downstream)", lossPerKm: 0.22 },
]

// Splitter configurations with typical insertion loss (dB)
const splitters = [
  { ratio: "None", loss: 0 },
  { ratio: "1:2", loss: 3.5 },
  { ratio: "1:4", loss: 7.2 },
  { ratio: "1:8", loss: 10.5 },
  { ratio: "1:16", loss: 13.8 },
  { ratio: "1:32", loss: 17.0 },
  { ratio: "1:64", loss: 20.3 },
]

export default function OpmCalculatorPage() {
  const [wavelength, setWavelength] = useState(1490)
  const [txPower, setTxPower] = useState(3.0) // dBm
  const [length, setLength] = useState(5.0) // km
  const [splices, setSplices] = useState(4)
  const [connectors, setConnectors] = useState(4)
  const [splitter1, setSplitter1] = useState("1:8")
  const [splitter2, setSplitter2] = useState("None")
  const [safetyMargin, setSafetyMargin] = useState(3.0) // dB

  // Find active wavelength coefficient
  const activeWavelength = useMemo(() => {
    return wavelengths.find((w) => w.value === wavelength) || wavelengths[1]
  }, [wavelength])

  // Find splitter losses
  const s1Loss = useMemo(() => {
    return splitters.find((s) => s.ratio === splitter1)?.loss || 0
  }, [splitter1])

  const s2Loss = useMemo(() => {
    return splitters.find((s) => s.ratio === splitter2)?.loss || 0
  }, [splitter2])

  // Calculation results
  const results = useMemo(() => {
    const fiberLoss = length * activeWavelength.lossPerKm
    const spliceLoss = splices * 0.05
    const connectorLoss = connectors * 0.25
    const totalLoss = fiberLoss + spliceLoss + connectorLoss + s1Loss + s2Loss + safetyMargin
    const rxPower = txPower - totalLoss

    // GPON standard receiving sensitivity: -8 dBm to -27 dBm
    let status: "safe" | "warning" | "danger" = "safe"
    let message = "Excellent Signal"

    if (rxPower < -27) {
      status = "danger"
      message = "Critical: Optical Link Failure (LOS)"
    } else if (rxPower < -25) {
      status = "warning"
      message = "Warning: Weak Signal / High Attenuation"
    } else if (rxPower > -8) {
      status = "warning"
      message = "Warning: Signal Too Strong (Risk of ONT Saturation)"
    }

    return {
      fiberLoss,
      spliceLoss,
      connectorLoss,
      totalLoss,
      rxPower,
      status,
      message,
    }
  }, [txPower, length, splices, connectors, s1Loss, s2Loss, safetyMargin, activeWavelength])

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          OPM Link Budget Calculator
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Analyze fiber path losses, estimate expected power levels, and verify optical network configurations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
        {/* Input Parameters Form */}
        <div className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm space-y-6">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Path Parameters
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Wavelength */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Wavelength</label>
              <select
                value={wavelength}
                onChange={(e) => setWavelength(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
              >
                {wavelengths.map((w) => (
                  <option key={w.value} value={w.value} className="bg-neutral-900">
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            {/* OLT TX Power */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">OLT TX Power (dBm)</label>
              <input
                type="number"
                step="0.1"
                value={txPower}
                onChange={(e) => setTxPower(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
              />
            </div>

            {/* Fiber Distance */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Fiber Distance (km)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={length}
                onChange={(e) => setLength(Math.max(0, Number(e.target.value)))}
                className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
              />
            </div>

            {/* Safety Margin */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Safety / Repair Margin (dB)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={safetyMargin}
                onChange={(e) => setSafetyMargin(Math.max(0, Number(e.target.value)))}
                className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
              />
            </div>

            {/* Fusion Splices */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Fusion Splices (Qty)</label>
              <input
                type="number"
                min="0"
                value={splices}
                onChange={(e) => setSplices(Math.max(0, Number(e.target.value)))}
                className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
              />
            </div>

            {/* Connectors */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Connector Pairs (Qty)</label>
              <input
                type="number"
                min="0"
                value={connectors}
                onChange={(e) => setConnectors(Math.max(0, Number(e.target.value)))}
                className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
              />
            </div>

            {/* Splitter Stage 1 */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Stage 1 Splitter (ODC / FDT)</label>
              <select
                value={splitter1}
                onChange={(e) => setSplitter1(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
              >
                {splitters.map((s) => (
                  <option key={s.ratio} value={s.ratio} className="bg-neutral-900">
                    {s.ratio} ({s.loss > 0 ? `+${s.loss} dB` : "No splitter"})
                  </option>
                ))}
              </select>
            </div>

            {/* Splitter Stage 2 */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Stage 2 Splitter (ODP / FAT)</label>
              <select
                value={splitter2}
                onChange={(e) => setSplitter2(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
              >
                {splitters.filter((s) => s.ratio !== "1:64").map((s) => (
                  <option key={s.ratio} value={s.ratio} className="bg-neutral-900">
                    {s.ratio} ({s.loss > 0 ? `+${s.loss} dB` : "No splitter"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive Schematic Diagram */}
          <div className="pt-4 border-t border-white/10">
            <h3 className="text-xs text-muted-foreground font-medium mb-3">Optical Path Visualizer</h3>
            <div className="flex items-center justify-between p-4 bg-white/[0.01] border border-white/5 rounded-2xl overflow-x-auto text-[10px] gap-4">
              <div className="flex flex-col items-center gap-1.5 text-center min-w-[50px]">
                <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary">TX</div>
                <span className="font-semibold text-foreground">OLT</span>
                <span className="text-muted-foreground">{txPower.toFixed(1)} dBm</span>
              </div>
              <div className="h-px bg-white/20 flex-1 min-w-[30px]" />
              <div className="flex flex-col items-center gap-1.5 text-center min-w-[50px]">
                <div className="h-8 w-8 rounded-lg bg-neutral-800 border border-white/10 flex items-center justify-center text-muted-foreground font-semibold">
                  {length}k
                </div>
                <span className="font-semibold text-foreground">Fiber</span>
                <span className="text-muted-foreground">-{results.fiberLoss.toFixed(2)} dB</span>
              </div>
              {splitter1 !== "None" && (
                <>
                  <div className="h-px bg-white/20 flex-1 min-w-[30px]" />
                  <div className="flex flex-col items-center gap-1.5 text-center min-w-[50px]">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-bold text-blue-400">ODC</div>
                    <span className="font-semibold text-foreground">{splitter1}</span>
                    <span className="text-muted-foreground">-{s1Loss} dB</span>
                  </div>
                </>
              )}
              {splitter2 !== "None" && (
                <>
                  <div className="h-px bg-white/20 flex-1 min-w-[30px]" />
                  <div className="flex flex-col items-center gap-1.5 text-center min-w-[50px]">
                    <div className="h-8 w-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center font-bold text-teal-400">ODP</div>
                    <span className="font-semibold text-foreground">{splitter2}</span>
                    <span className="text-muted-foreground">-{s2Loss} dB</span>
                  </div>
                </>
              )}
              <div className="h-px bg-white/20 flex-1 min-w-[30px]" />
              <div className="flex flex-col items-center gap-1.5 text-center min-w-[50px]">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold border ${
                  results.status === "safe" 
                    ? "bg-primary/10 border-primary/20 text-primary" 
                    : results.status === "warning" 
                      ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" 
                      : "bg-red-500/10 border-red-500/20 text-red-400"
                }`}>RX</div>
                <span className="font-semibold text-foreground">ONT</span>
                <span className="text-muted-foreground">{results.rxPower.toFixed(2)} dBm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="space-y-6">
          {/* Main Calculation Card */}
          <div className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm text-center relative overflow-hidden">
            <div className={`absolute inset-0 pointer-events-none opacity-5 blur-2xl ${
              results.status === "safe" ? "bg-primary" : results.status === "warning" ? "bg-yellow-500" : "bg-red-500"
            }`} />

            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Estimated Rx Power</span>
            <div className={`text-4xl sm:text-5xl font-bold tracking-tight mt-2 ${
              results.status === "safe" ? "text-primary" : results.status === "warning" ? "text-yellow-400" : "text-red-400"
            }`}>
              {results.rxPower.toFixed(2)} <span className="text-xl font-normal text-muted-foreground">dBm</span>
            </div>

            {/* Status Badge */}
            <div className="mt-4 flex items-center justify-center gap-2">
              {results.status === "safe" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary ring-1 ring-primary/20">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {results.message}
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ring-1 ${
                  results.status === "warning" 
                    ? "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20" 
                    : "bg-red-500/10 text-red-400 ring-red-500/20"
                }`}>
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {results.message}
                </span>
              )}
            </div>
            
            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              Standard safe operating window is between **-8.0 dBm** and **-27.0 dBm** (Class B+ GPON optics).
            </p>
          </div>

          {/* Loss Breakdown Card */}
          <div className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm space-y-4">
            <h3 className="text-sm font-medium border-b border-white/10 pb-2">Loss Breakdown</h3>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Fiber attenuation ({activeWavelength.lossPerKm} dB/km)</span>
                <span className="font-medium">-{results.fiberLoss.toFixed(2)} dB</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Fusion splices ({splices} × 0.05 dB)</span>
                <span className="font-medium">-{results.spliceLoss.toFixed(2)} dB</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Connectors ({connectors} × 0.25 dB)</span>
                <span className="font-medium">-{results.connectorLoss.toFixed(2)} dB</span>
              </div>
              {splitter1 !== "None" && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Stage 1 Splitter ({splitter1})</span>
                  <span className="font-medium">-{s1Loss.toFixed(1)} dB</span>
                </div>
              )}
              {splitter2 !== "None" && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Stage 2 Splitter ({splitter2})</span>
                  <span className="font-medium">-{s2Loss.toFixed(1)} dB</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Safety / Repair margin</span>
                <span className="font-medium">-{safetyMargin.toFixed(2)} dB</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-white/10 font-semibold text-foreground">
                <span>Total Attenuation Loss</span>
                <span>-{results.totalLoss.toFixed(2)} dB</span>
              </div>
            </div>
          </div>

          {/* Guidelines */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.01] p-5 space-y-3">
            <h4 className="text-xs font-semibold flex items-center gap-1.5 text-foreground uppercase tracking-wider">
              <Info className="h-4 w-4 text-primary" />
              Standard ITU-T Rec. Loss Targets
            </h4>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1.5 leading-relaxed">
              <li>Keep fusion splices under **0.10 dB** (local target: 0.05 dB).</li>
              <li>Clean fiber connectors before OPM measurements to avoid connector losses above **0.50 dB**.</li>
              <li>Always include a **3.0 dB safety margin** to account for future aging, temperature changes, and fiber repairs.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
