"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { Palette, Info, HelpCircle } from "lucide-react"

// Standard 12 color coding sequence
const colorSequenceEn = [
  { id: 1, name: "Blue", hex: "#3b82f6", textHex: "#ffffff" },
  { id: 2, name: "Orange", hex: "#f97316", textHex: "#000000" },
  { id: 3, name: "Green", hex: "#22c55e", textHex: "#ffffff" },
  { id: 4, name: "Brown", hex: "#a16207", textHex: "#ffffff" },
  { id: 5, name: "Slate / Grey", hex: "#6b7280", textHex: "#ffffff" },
  { id: 6, name: "White", hex: "#ffffff", textHex: "#000000" },
  { id: 7, name: "Red", hex: "#ef4444", textHex: "#ffffff" },
  { id: 8, name: "Black", hex: "#000000", textHex: "#ffffff" },
  { id: 9, name: "Yellow", hex: "#eab308", textHex: "#000000" },
  { id: 10, name: "Violet / Purple", hex: "#a855f7", textHex: "#ffffff" },
  { id: 11, name: "Rose / Pink", hex: "#ec4899", textHex: "#ffffff" },
  { id: 12, name: "Aqua / Turquoise", hex: "#06b6d4", textHex: "#000000" },
]

const colorSequenceId = [
  { id: 1, name: "Biru", hex: "#3b82f6", textHex: "#ffffff" },
  { id: 2, name: "Jingga / Oranye", hex: "#f97316", textHex: "#000000" },
  { id: 3, name: "Hijau", hex: "#22c55e", textHex: "#ffffff" },
  { id: 4, name: "Cokelat", hex: "#a16207", textHex: "#ffffff" },
  { id: 5, name: "Abu-abu", hex: "#6b7280", textHex: "#ffffff" },
  { id: 6, name: "Putih", hex: "#ffffff", textHex: "#000000" },
  { id: 7, name: "Merah", hex: "#ef4444", textHex: "#ffffff" },
  { id: 8, name: "Hitam", hex: "#000000", textHex: "#ffffff" },
  { id: 9, name: "Kuning", hex: "#eab308", textHex: "#000000" },
  { id: 10, name: "Ungu", hex: "#a855f7", textHex: "#ffffff" },
  { id: 11, name: "Pink / Merah Muda", hex: "#ec4899", textHex: "#ffffff" },
  { id: 12, name: "Toska / Aqua", hex: "#06b6d4", textHex: "#000000" },
]

const capacities = [12, 24, 48, 96, 144, 288]

export default function FiberColorCodePage() {
  const [standard, setStandard] = useState<"TIA" | "Telkom">("Telkom")
  const [coreNumber, setCoreNumber] = useState<number>(1)
  const [capacity, setCapacity] = useState<number>(96)
  const [coresPerTube, setCoresPerTube] = useState<number>(12)

  const activeColors = useMemo(() => {
    return standard === "TIA" ? colorSequenceEn : colorSequenceId
  }, [standard])

  const calculation = useMemo(() => {
    // Sanitize input
    const core = Math.min(Math.max(1, coreNumber), capacity)
    
    // Calculate Tube Index (1-based)
    const tubeIndex = Math.ceil(core / coresPerTube)
    
    // Calculate Core Index inside the Tube (1-based)
    const coreIndex = ((core - 1) % coresPerTube) + 1

    // Find tube color name and hex (12-color cycle)
    const tubeColorObj = activeColors[((tubeIndex - 1) % 12)]
    // Find core color name and hex
    const coreColorObj = activeColors[coreIndex - 1]

    return {
      core,
      tubeIndex,
      coreIndex,
      tubeColor: tubeColorObj.name,
      tubeHex: tubeColorObj.hex,
      tubeTextHex: tubeColorObj.textHex,
      coreColor: coreColorObj.name,
      coreHex: coreColorObj.hex,
      coreTextHex: coreColorObj.textHex,
    }
  }, [coreNumber, capacity, coresPerTube, activeColors])

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Fiber Color Code Finder
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Quickly identify tube and core colors for fiber optic splicing and planning. Supports TIA-598-C and Telkom Indonesia standard mnemonics.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 items-start">
        {/* Core Finder Inputs */}
        <div className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm space-y-6">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Color Configuration
          </h2>

          <div className="space-y-4">
            {/* Standard Selection */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground font-medium">Color Code Standard</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStandard("Telkom")}
                  className={`h-10 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                    standard === "Telkom"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white/[0.03] text-muted-foreground border-white/10 hover:border-white/20"
                  }`}
                >
                  Telkom Indonesia
                </button>
                <button
                  type="button"
                  onClick={() => setStandard("TIA")}
                  className={`h-10 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                    standard === "TIA"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white/[0.03] text-muted-foreground border-white/10 hover:border-white/20"
                  }`}
                >
                  TIA-598-C (International)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Cable Capacity */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Cable Capacity</label>
                <select
                  value={capacity}
                  onChange={(e) => {
                    const cap = Number(e.target.value)
                    setCapacity(cap)
                    if (coreNumber > cap) setCoreNumber(cap)
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
                >
                  {capacities.map((c) => (
                    <option key={c} value={c} className="bg-neutral-900">
                      {c} Core
                    </option>
                  ))}
                </select>
              </div>

              {/* Cores Per Tube */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Cores per Tube</label>
                <select
                  value={coresPerTube}
                  onChange={(e) => setCoresPerTube(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
                >
                  <option value={12} className="bg-neutral-900">12 Cores (Standard)</option>
                  <option value={6} className="bg-neutral-900">6 Cores (Legacy)</option>
                  <option value={24} className="bg-neutral-900">24 Cores (High Density)</option>
                </select>
              </div>

              {/* Core Number Input */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Enter Core Number</label>
                <input
                  type="number"
                  min="1"
                  max={capacity}
                  value={coreNumber || ""}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    if (val > 0) {
                      setCoreNumber(Math.min(val, capacity))
                    } else {
                      setCoreNumber(0)
                    }
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
          </div>

          {/* Quick Slider */}
          <div className="space-y-2 pt-2">
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Core 1</span>
              <span>Core {capacity}</span>
            </div>
            <input
              type="range"
              min="1"
              max={capacity}
              value={coreNumber || 1}
              onChange={(e) => setCoreNumber(Number(e.target.value))}
              className="w-full h-1.5 rounded-lg bg-white/10 appearance-none cursor-pointer accent-primary"
            />
          </div>
        </div>

        {/* Visual Lookup Result */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm text-center relative overflow-hidden flex flex-col items-center">
            {/* Visual Cable Cross Section SVG */}
            <div className="h-32 w-32 relative mb-6">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                {/* Cable Outer Jacket */}
                <circle cx="50" cy="50" r="45" fill="none" stroke="oklch(1 0 0 / 0.1)" strokeWidth="2" />
                
                {/* Active Tube (Outer Ring) */}
                <circle
                  cx="50"
                  cy="50"
                  r="30"
                  fill="none"
                  stroke={calculation.tubeHex}
                  strokeWidth="8"
                  className="transition-all duration-300"
                />
                
                {/* Active Core (Inner Dot) */}
                <circle
                  cx="50"
                  cy="50"
                  r="12"
                  fill={calculation.coreHex}
                  stroke={calculation.coreHex === "#ffffff" ? "#000000" : "none"}
                  strokeWidth={calculation.coreHex === "#ffffff" ? "1" : "0"}
                  className="transition-all duration-300"
                />
              </svg>
              {/* Labels overlay */}
              <div className="absolute inset-0 flex flex-col justify-between p-1.5 pointer-events-none text-[8px] text-muted-foreground">
                <div className="text-center">TUBE OUTER</div>
                <div className="text-center mt-auto">CORE CENTER</div>
              </div>
            </div>

            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Result for Core {calculation.core}</span>
            
            <div className="mt-4 w-full grid grid-cols-2 gap-4">
              {/* Tube Result */}
              <div className="rounded-xl border border-white/5 bg-white/[0.01] p-3 text-center">
                <span className="text-[10px] text-muted-foreground font-medium block mb-1">TUBE (BUNCH)</span>
                <div className="text-sm font-semibold mb-2">Tube #{calculation.tubeIndex}</div>
                <div
                  className="h-7 rounded-lg flex items-center justify-center text-xs font-semibold px-2 transition-all duration-300 border border-white/10"
                  style={{ backgroundColor: calculation.tubeHex, color: calculation.tubeTextHex }}
                >
                  {calculation.tubeColor}
                </div>
              </div>

              {/* Core Result */}
              <div className="rounded-xl border border-white/5 bg-white/[0.01] p-3 text-center">
                <span className="text-[10px] text-muted-foreground font-medium block mb-1">CORE (FIBER)</span>
                <div className="text-sm font-semibold mb-2">Core #{calculation.coreIndex}</div>
                <div
                  className="h-7 rounded-lg flex items-center justify-center text-xs font-semibold px-2 transition-all duration-300 border border-white/10"
                  style={{ backgroundColor: calculation.coreHex, color: calculation.coreTextHex }}
                >
                  {calculation.coreColor}
                </div>
              </div>
            </div>

            <div className="mt-5 text-xs text-muted-foreground leading-relaxed text-left w-full border-t border-white/10 pt-4 space-y-1">
              <div>• Total cores parsed: <span className="font-semibold text-foreground">{capacity} Cores</span></div>
              <div>• Tubes count: <span className="font-semibold text-foreground">{Math.ceil(capacity / coresPerTube)} Tubes</span></div>
              {standard === "Telkom" && (
                <div className="text-[11px] text-primary/80 mt-2 font-mono">
                  Mnemonic: Biru, Jingga, Hijau, Cokelat, Abu-abu, Putih, Merah, Hitam, Kuning, Ungu, Pink, Toska.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 12-Color Sequence Quick Reference */}
      <div className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm">
        <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          Standard 12-Color Sequence Reference
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {activeColors.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-white/5 bg-white/[0.01] p-2.5 flex flex-col items-center gap-1.5"
            >
              <div
                className="h-8 w-8 rounded-full border border-white/20 flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: c.hex, color: c.textHex }}
              >
                {c.id}
              </div>
              <span className="text-xs font-medium text-foreground">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
