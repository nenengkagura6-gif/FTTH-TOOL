"use client"

import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  GitFork,
  Network,
  Activity,
  ShieldAlert,
  CheckCircle,
  Info,
  Sliders,
  Settings,
  HelpCircle,
  TrendingDown,
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Plus,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------
// Standards & Reference Configuration Data
// ---------------------------------------------------------

const standards = [
  { id: "gpon-b", label: "GPON Class B+", txMin: 1.5, txMax: 5.0, rxMin: -8.0, rxMax: -27.0 },
  { id: "gpon-c", label: "GPON Class C+", txMin: 3.0, txMax: 7.0, rxMin: -12.0, rxMax: -30.0 },
  { id: "epon-px20", label: "EPON PX20", txMin: 2.0, txMax: 7.0, rxMin: -3.0, rxMax: -24.0 },
  { id: "xgspon-n1", label: "XGS-PON N1/N2", txMin: 4.0, txMax: 9.0, rxMin: -9.0, rxMax: -28.0 },
]

const wavelengths = [
  { value: 1490, label: "1490 nm (GPON Downstream)", lossPerKm: 0.23 },
  { value: 1310, label: "1310 nm (GPON Upstream)", lossPerKm: 0.35 },
  { value: 1550, label: "1550 nm (RF Overlay / CATV)", lossPerKm: 0.20 },
]

const balancedSplitters = [
  { ratio: "None", loss: 0 },
  { ratio: "1:2", loss: 3.5 },
  { ratio: "1:4", loss: 7.2 },
  { ratio: "1:8", loss: 10.5 },
  { ratio: "1:16", loss: 13.8 },
  { ratio: "1:32", loss: 17.0 },
  { ratio: "1:64", loss: 20.3 },
]

const unbalancedSplitters = [
  { ratio: "5/95", tapLoss: 14.5, throughLoss: 0.5 },
  { ratio: "10/90", tapLoss: 10.8, throughLoss: 0.7 },
  { ratio: "15/85", tapLoss: 9.0, throughLoss: 0.9 },
  { ratio: "20/80", tapLoss: 7.8, throughLoss: 1.1 },
  { ratio: "30/70", tapLoss: 5.8, throughLoss: 1.8 },
  { ratio: "40/60", tapLoss: 4.6, throughLoss: 2.5 },
  { ratio: "50/50", tapLoss: 3.5, throughLoss: 3.5 },
]

const distributionSplitters = [
  { id: "direct", label: "Direct (1:1)", loss: 0 },
  { id: "1:2", label: "1:2 Splitter", loss: 3.5 },
  { id: "1:4", label: "1:4 Splitter", loss: 7.2 },
  { id: "1:8", label: "1:8 Splitter", loss: 10.5 },
  { id: "1:16", label: "1:16 Splitter", loss: 13.8 },
]

// Preset Daisy-Chain topologies
const daisyPresets = [
  {
    name: "Standard Uniform (10/90)",
    ratios: ["10/90", "10/90", "10/90", "10/90", "10/90"],
  },
  {
    name: "Optimized Balanced Power",
    ratios: ["5/95", "10/90", "15/85", "20/80", "50/50"],
  },
]

interface BusNode {
  id: number
  name: string
  distance: number // km from OLT or previous node
  tapRatio: string // e.g. "10/90"
  localSplitter: string // e.g. "1:8"
}

export default function GponSplitterEstimatorPage() {
  const [locale, setLocale] = useState<"en" | "id">("en")
  const [topology, setTopology] = useState<"star" | "bus">("star")
  const [standardId, setStandardId] = useState("gpon-b")
  const [wavelength, setWavelength] = useState(1490)
  const [txPower, setTxPower] = useState(3.0) // dBm
  const [safetyMargin, setSafetyMargin] = useState(3.0) // dB

  // Star Topology state
  const [starDistance, setStarDistance] = useState(5.0) // km
  const [starSplices, setStarSplices] = useState(4)
  const [starConnectors, setStarConnectors] = useState(4)
  const [starSplitter1, setStarSplitter1] = useState("1:8")
  const [starSplitter2, setStarSplitter2] = useState("1:4")
  const [starSplitter3, setStarSplitter3] = useState("None")

  // Bus/Daisy-Chain state
  const [busNodes, setBusNodes] = useState<BusNode[]>([
    { id: 1, name: "ODP 01", distance: 2.0, tapRatio: "10/90", localSplitter: "1:8" },
    { id: 2, name: "ODP 02", distance: 0.15, tapRatio: "10/90", localSplitter: "1:8" },
    { id: 3, name: "ODP 03", distance: 0.15, tapRatio: "15/85", localSplitter: "1:8" },
    { id: 4, name: "ODP 04", distance: 0.15, tapRatio: "20/80", localSplitter: "1:8" },
    { id: 5, name: "ODP 05", distance: 0.15, tapRatio: "50/50", localSplitter: "1:8" },
  ])
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(1)

  useEffect(() => {
    const stored = localStorage.getItem("locale")
    if (stored === "id" || stored === "en") {
      setLocale(stored)
    }
  }, [])

  const selectedStandard = useMemo(() => {
    return standards.find((s) => s.id === standardId) || standards[0]
  }, [standardId])

  const activeWavelength = useMemo(() => {
    return wavelengths.find((w) => w.value === wavelength) || wavelengths[0]
  }, [wavelength])

  // Dictionary translations
  const t = {
    title: locale === "id" ? "Estimator Splitter & Redaman GPON" : "GPON Splitter & Attenuation Estimator",
    subtitle: locale === "id" 
      ? "Simulasikan redaman optik bertingkat (Star) dan daisy-chain tap tidak seimbang (Bus) sesuai standar ITU-T." 
      : "Simulate cascaded star topologies and unbalanced tap daisy chains matching ITU-T engineering targets.",
    topology: locale === "id" ? "Topologi Jaringan" : "Network Topology",
    star: locale === "id" ? "Star (Cascaded Balanced)" : "Star (Cascaded Balanced)",
    bus: locale === "id" ? "Bus (Daisy Chain Unbalanced)" : "Bus (Daisy Chain Unbalanced)",
    standard: locale === "id" ? "Standar Optik" : "Optical Standard",
    parameters: locale === "id" ? "Parameter Masukan" : "Input Parameters",
    txPower: locale === "id" ? "Daya OLT TX (dBm)" : "OLT TX Power (dBm)",
    wavelength: locale === "id" ? "Panjang Gelombang" : "Wavelength",
    safetyMargin: locale === "id" ? "Margin Pengaman (dB)" : "Safety Margin (dB)",
    distance: locale === "id" ? "Jarak Serat Optik (km)" : "Fiber Distance (km)",
    splices: locale === "id" ? "Koneksi Splice (Jumlah)" : "Fusion Splices (Qty)",
    connectors: locale === "id" ? "Koneksi Adaptor (Jumlah)" : "Connector Pairs (Qty)",
    splitter: (stage: number) => locale === "id" ? `Splitter Tahap ${stage}` : `Stage ${stage} Splitter`,
    results: locale === "id" ? "Hasil Perhitungan" : "Calculated Results",
    rxEstimated: locale === "id" ? "Estimasi Daya Terima (Rx)" : "Estimated Rx Power",
    statusSafe: locale === "id" ? "Sinyal Bagus" : "Excellent Signal",
    statusWarning: locale === "id" ? "Peringatan: Redaman Tinggi" : "Warning: Weak Signal / High Loss",
    statusStrong: locale === "id" ? "Peringatan: Sinyal Terlalu Kuat" : "Warning: Too Strong (Risk of Saturation)",
    statusCritical: locale === "id" ? "Gagal: Sinyal Hilang (LOS)" : "Critical: Signal Lost (LOS)",
    breakdown: locale === "id" ? "Rincian Redaman" : "Loss Breakdown",
    fiberLoss: locale === "id" ? "Redaman Kabel Serat" : "Fiber attenuation",
    spliceLoss: locale === "id" ? "Sambungan Fusion Splice" : "Fusion splices",
    connectorLoss: locale === "id" ? "Konektor Adaptor" : "Connectors",
    totalLoss: locale === "id" ? "Total Redaman Lintasan" : "Total Path Attenuation",
    guidelines: locale === "id" ? "Panduan Desain Lapangan" : "Engineering Guidelines",
    targetSensitivity: locale === "id" ? "Sensitivitas Target ONT" : "Target ONT Sensitivity",
    nodeConfig: locale === "id" ? "Konfigurasi Kotak ODP" : "ODP Node Configuration",
    nodeName: locale === "id" ? "Nama Node/ODP" : "Node/ODP Name",
    tapRatio: locale === "id" ? "Rasio Tap Splitter" : "Tap Splitter Ratio",
    localSplit: locale === "id" ? "Splitter Pelanggan" : "Local Customer Splitter",
    addNode: locale === "id" ? "Tambah ODP" : "Add ODP",
    removeNode: locale === "id" ? "Hapus ODP" : "Remove Node",
    presets: locale === "id" ? "Preset Topologi Daisy-Chain" : "Daisy Chain Presets",
  }

  // ---------------------------------------------------------
  // Star Calculations
  // ---------------------------------------------------------
  const starResults = useMemo(() => {
    const fiberLoss = starDistance * activeWavelength.lossPerKm
    const spliceLoss = starSplices * 0.05
    const connectorLoss = starConnectors * 0.25
    const s1Loss = balancedSplitters.find((s) => s.ratio === starSplitter1)?.loss || 0
    const s2Loss = balancedSplitters.find((s) => s.ratio === starSplitter2)?.loss || 0
    const s3Loss = balancedSplitters.find((s) => s.ratio === starSplitter3)?.loss || 0

    const totalLoss = fiberLoss + spliceLoss + connectorLoss + s1Loss + s2Loss + s3Loss + safetyMargin
    const rxPower = txPower - totalLoss

    let status: "safe" | "warning" | "danger" = "safe"
    let message = t.statusSafe

    if (rxPower < selectedStandard.rxMax) {
      status = "danger"
      message = t.statusCritical
    } else if (rxPower < selectedStandard.rxMax + 2.0) {
      status = "warning"
      message = t.statusWarning
    } else if (rxPower > selectedStandard.rxMin) {
      status = "warning"
      message = t.statusStrong
    }

    return {
      fiberLoss,
      spliceLoss,
      connectorLoss,
      s1Loss,
      s2Loss,
      s3Loss,
      totalLoss,
      rxPower,
      status,
      message,
    }
  }, [
    starDistance,
    starSplices,
    starConnectors,
    starSplitter1,
    starSplitter2,
    starSplitter3,
    activeWavelength,
    safetyMargin,
    txPower,
    selectedStandard,
    locale,
  ])

  // ---------------------------------------------------------
  // Bus Calculations
  // ---------------------------------------------------------
  const busResults = useMemo(() => {
    const resultsList: Array<{
      id: number
      name: string
      inputPower: number
      tapRatio: string
      tapLoss: number
      throughLoss: number
      localSplitter: string
      localSplitterLoss: number
      throughPower: number // Exiting to next node
      rxPower: number // Received at local ONT
      status: "safe" | "warning" | "danger"
    }> = []

    let currentInputPower = txPower

    for (let i = 0; i < busNodes.length; i++) {
      const node = busNodes[i]
      
      // Calculate fiber link loss between previous point and this node
      const fiberLinkLoss = node.distance * activeWavelength.lossPerKm
      // Connectors and splices on the main core between nodes
      const mainLinkLoss = fiberLinkLoss + 0.05 + 0.5 // 1 splice (0.05), 2 connectors (0.5)
      
      const nodeInputPower = currentInputPower - mainLinkLoss

      // Find Tap split values
      const tapConfig = unbalancedSplitters.find((s) => s.ratio === node.tapRatio) || unbalancedSplitters[0]
      const tapLoss = tapConfig.tapLoss
      // If last node, all remaining power is terminated/goes into tap; no through power exits
      const throughLoss = i === busNodes.length - 1 ? Infinity : tapConfig.throughLoss

      // Find local customer splitter loss inside the ODP
      const localSplitterObj = distributionSplitters.find((s) => s.id === node.localSplitter) || distributionSplitters[0]
      const localSplitterLoss = localSplitterObj.loss

      // Calculate output powers
      const customerRx = nodeInputPower - tapLoss - localSplitterLoss - safetyMargin
      const throughPower = nodeInputPower - throughLoss

      let status: "safe" | "warning" | "danger" = "safe"
      if (customerRx < selectedStandard.rxMax) {
        status = "danger"
      } else if (customerRx < selectedStandard.rxMax + 2.0) {
        status = "warning"
      } else if (customerRx > selectedStandard.rxMin) {
        status = "warning"
      }

      resultsList.push({
        id: node.id,
        name: node.name,
        inputPower: nodeInputPower,
        tapRatio: node.tapRatio,
        tapLoss,
        throughLoss,
        localSplitter: node.localSplitter,
        localSplitterLoss,
        throughPower,
        rxPower: customerRx,
        status,
      })

      // Output of this node through port is input to next node
      currentInputPower = throughPower
    }

    return resultsList
  }, [busNodes, activeWavelength, txPower, safetyMargin, selectedStandard])

  // Selected node configuration handlers
  const activeNode = useMemo(() => {
    return busNodes.find((n) => n.id === selectedNodeId) || null
  }, [busNodes, selectedNodeId])

  const updateNodeProperty = (property: keyof BusNode, value: any) => {
    if (selectedNodeId === null) return
    setBusNodes((prev) =>
      prev.map((n) => (n.id === selectedNodeId ? { ...n, [property]: value } : n))
    )
  }

  const handleAddNode = () => {
    const newId = busNodes.length > 0 ? Math.max(...busNodes.map((n) => n.id)) + 1 : 1
    const newNode: BusNode = {
      id: newId,
      name: `ODP 0${newId}`,
      distance: 0.15,
      tapRatio: "10/90",
      localSplitter: "1:8",
    }
    setBusNodes([...busNodes, newNode])
    setSelectedNodeId(newId)
  }

  const handleRemoveNode = (idToRemove: number) => {
    if (busNodes.length <= 1) return
    const filtered = busNodes.filter((n) => n.id !== idToRemove)
    setBusNodes(filtered)
    setSelectedNodeId(filtered[filtered.length - 1].id)
  }

  const applyPreset = (presetIndex: number) => {
    const preset = daisyPresets[presetIndex]
    setBusNodes((prev) => {
      const length = Math.min(prev.length, preset.ratios.length)
      const updated = prev.map((node, i) => {
        if (i < preset.ratios.length) {
          return { ...node, tapRatio: preset.ratios[i] }
        }
        return node
      })
      return updated
    })
  }

  return (
    <div className="space-y-6 max-w-7xl pb-10">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
            {t.title}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <Sliders className="h-3.5 w-3.5" />
            {t.standard}:
          </span>
          <select
            value={standardId}
            onChange={(e) => setStandardId(e.target.value)}
            className="h-8 px-2 rounded-lg border border-white/10 bg-white/[0.03] text-xs font-semibold text-foreground focus:outline-none focus:border-white/20"
          >
            {standards.map((s) => (
              <option key={s.id} value={s.id} className="bg-neutral-900">
                {s.label} ({s.rxMax} dBm target)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Topologies selector tabs */}
      <div className="flex border-b border-white/10">
        <button
          type="button"
          onClick={() => setTopology("star")}
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all",
            topology === "star"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
          )}
        >
          <Layers className="h-4 w-4" />
          {t.star}
        </button>
        <button
          type="button"
          onClick={() => setTopology("bus")}
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all",
            topology === "bus"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
          )}
        >
          <Network className="h-4 w-4" />
          {t.bus}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
        {/* Left Side: Parameters */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-card/30 p-6 backdrop-blur-md space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b border-white/10 pb-3">
              <Activity className="h-5 w-5 text-primary animate-pulse" />
              {t.parameters}
            </h2>

            {/* General parameters shared by both topologies */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.txPower}</label>
                <input
                  type="number"
                  step="0.1"
                  value={txPower}
                  onChange={(e) => setTxPower(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.wavelength}</label>
                <select
                  value={wavelength}
                  onChange={(e) => setWavelength(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all"
                >
                  {wavelengths.map((w) => (
                    <option key={w.value} value={w.value} className="bg-neutral-900 text-xs">
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.safetyMargin}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={safetyMargin}
                  onChange={(e) => setSafetyMargin(Math.max(0, Number(e.target.value)))}
                  className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                />
              </div>
            </div>

            {/* Star Specific Parameters */}
            {topology === "star" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/10"
              >
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.distance}</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={starDistance}
                    onChange={(e) => setStarDistance(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.splices}</label>
                  <input
                    type="number"
                    min="0"
                    value={starSplices}
                    onChange={(e) => setStarSplices(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.connectors}</label>
                  <input
                    type="number"
                    min="0"
                    value={starConnectors}
                    onChange={(e) => setStarConnectors(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                  />
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.splitter(1)}</label>
                  <select
                    value={starSplitter1}
                    onChange={(e) => setStarSplitter1(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all"
                  >
                    {balancedSplitters.map((s) => (
                      <option key={s.ratio} value={s.ratio} className="bg-neutral-900">
                        {s.ratio} {s.loss > 0 ? `(-${s.loss} dB)` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.splitter(2)}</label>
                  <select
                    value={starSplitter2}
                    onChange={(e) => setStarSplitter2(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all"
                  >
                    {balancedSplitters.map((s) => (
                      <option key={s.ratio} value={s.ratio} className="bg-neutral-900">
                        {s.ratio} {s.loss > 0 ? `(-${s.loss} dB)` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.splitter(3)}</label>
                  <select
                    value={starSplitter3}
                    onChange={(e) => setStarSplitter3(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all"
                  >
                    {balancedSplitters.map((s) => (
                      <option key={s.ratio} value={s.ratio} className="bg-neutral-900">
                        {s.ratio} {s.loss > 0 ? `(-${s.loss} dB)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </motion.div>
            )}

            {/* Bus Specific Node Configurator */}
            {topology === "bus" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 pt-4 border-t border-white/10"
              >
                {/* Node spacing & Preset buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.presets}:</span>
                    {daisyPresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applyPreset(idx)}
                        className="px-2.5 py-1 text-[11px] rounded-lg border border-white/10 bg-white/[0.02] text-foreground hover:bg-white/[0.06] transition-colors"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddNode}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t.addNode}
                  </button>
                </div>

                {/* Node Cards Horizontal Scroll / List */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {busNodes.map((node, i) => {
                    const isSelected = node.id === selectedNodeId
                    const nodeResults = busResults[i]
                    const statusColor =
                      nodeResults?.status === "safe"
                        ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                        : nodeResults?.status === "warning"
                          ? "border-amber-500/30 text-amber-400 bg-amber-500/5"
                          : "border-red-500/30 text-red-400 bg-red-500/5"

                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        className={cn(
                          "flex flex-col items-center justify-between p-3.5 rounded-xl border text-center transition-all",
                          isSelected
                            ? "border-primary bg-primary/10 shadow-[0_0_10px_0_rgba(168,85,247,0.1)]"
                            : "border-white/10 bg-white/[0.01] hover:border-white/20"
                        )}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[10px] text-muted-foreground font-bold">{node.name}</span>
                          {busNodes.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveNode(node.id)
                              }}
                              className="text-muted-foreground hover:text-red-400 opacity-40 hover:opacity-100 transition-all"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="my-2.5">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-foreground font-semibold">
                            Tap {node.tapRatio}
                          </span>
                        </div>
                        <div className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border w-full", statusColor)}>
                          {nodeResults ? `${nodeResults.rxPower.toFixed(1)} dBm` : "—"}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Active node details editor */}
                {activeNode && (
                  <div className="rounded-xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                    <h3 className="text-xs text-primary font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Settings className="h-3.5 w-3.5" />
                      {t.nodeConfig}: {activeNode.name}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Name */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.nodeName}</label>
                        <input
                          type="text"
                          value={activeNode.name}
                          onChange={(e) => updateNodeProperty("name", e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                        />
                      </div>

                      {/* Distance */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          {activeNode.id === 1 ? "OLT Distance (km)" : "Span Distance (km)"}
                        </label>
                        <input
                          type="number"
                          step="0.05"
                          min="0.01"
                          value={activeNode.distance}
                          onChange={(e) => updateNodeProperty("distance", Math.max(0.01, Number(e.target.value)))}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all font-semibold"
                        />
                      </div>

                      {/* Tap Splitter Ratio */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.tapRatio}</label>
                        <select
                          value={activeNode.tapRatio}
                          onChange={(e) => updateNodeProperty("tapRatio", e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all"
                        >
                          {unbalancedSplitters.map((s) => (
                            <option key={s.ratio} value={s.ratio} className="bg-neutral-900 text-xs">
                              {s.ratio} (Tap: -{s.tapLoss}dB)
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Local Drop Splitter */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t.localSplit}</label>
                        <select
                          value={activeNode.localSplitter}
                          onChange={(e) => updateNodeProperty("localSplitter", e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-primary/30 transition-all"
                        >
                          {distributionSplitters.map((s) => (
                            <option key={s.id} value={s.id} className="bg-neutral-900 text-xs">
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Interactive Topological schematic / Visual Flow */}
          <div className="rounded-2xl border border-white/10 bg-card/20 p-6 backdrop-blur-sm">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-1.5 text-foreground uppercase tracking-wide">
              <Network className="h-4.5 w-4.5 text-primary" />
              Optical Network Schematic Visualizer
            </h3>

            {topology === "star" ? (
              /* Star Visualizer */
              <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-white/[0.01] border border-white/5 rounded-2xl overflow-x-auto text-[10px] gap-6">
                <div className="flex flex-col items-center gap-1 text-center min-w-[50px]">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-xs shadow-md">OLT</div>
                  <span className="font-bold text-foreground">TX</span>
                  <span className="text-muted-foreground">{txPower.toFixed(1)} dBm</span>
                </div>

                <div className="h-0.5 w-8 bg-gradient-to-r from-primary to-neutral-700 hidden sm:block" />

                <div className="flex flex-col items-center gap-1 text-center min-w-[50px]">
                  <div className="h-10 w-10 rounded-xl bg-neutral-800 border border-white/5 flex items-center justify-center text-muted-foreground font-semibold text-xs">
                    {starDistance}k
                  </div>
                  <span className="font-bold text-foreground">Fiber</span>
                  <span className="text-muted-foreground">-{starResults.fiberLoss.toFixed(2)} dB</span>
                </div>

                {starSplitter1 !== "None" && (
                  <>
                    <div className="h-0.5 w-8 bg-neutral-700 hidden sm:block" />
                    <div className="flex flex-col items-center gap-1 text-center min-w-[50px]">
                      <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center font-bold text-violet-400 text-xs">1st</div>
                      <span className="font-bold text-foreground">{starSplitter1}</span>
                      <span className="text-muted-foreground">-{starResults.s1Loss} dB</span>
                    </div>
                  </>
                )}

                {starSplitter2 !== "None" && (
                  <>
                    <div className="h-0.5 w-8 bg-neutral-700 hidden sm:block" />
                    <div className="flex flex-col items-center gap-1 text-center min-w-[50px]">
                      <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-bold text-blue-400 text-xs">2nd</div>
                      <span className="font-bold text-foreground">{starSplitter2}</span>
                      <span className="text-muted-foreground">-{starResults.s2Loss} dB</span>
                    </div>
                  </>
                )}

                {starSplitter3 !== "None" && (
                  <>
                    <div className="h-0.5 w-8 bg-neutral-700 hidden sm:block" />
                    <div className="flex flex-col items-center gap-1 text-center min-w-[50px]">
                      <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center font-bold text-cyan-400 text-xs">3rd</div>
                      <span className="font-bold text-foreground">{starSplitter3}</span>
                      <span className="text-muted-foreground">-{starResults.s3Loss} dB</span>
                    </div>
                  </>
                )}

                <div className="h-0.5 w-8 bg-gradient-to-r from-neutral-700 to-primary hidden sm:block" />

                <div className="flex flex-col items-center gap-1 text-center min-w-[50px]">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-xs border shadow-md ${
                    starResults.status === "safe"
                      ? "bg-primary/10 border-primary/20 text-primary"
                      : starResults.status === "warning"
                        ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                        : "bg-red-500/10 border-red-500/20 text-red-400"
                  }`}>ONT</div>
                  <span className="font-bold text-foreground">RX</span>
                  <span className="text-muted-foreground font-semibold">{starResults.rxPower.toFixed(2)} dBm</span>
                </div>
              </div>
            ) : (
              /* Bus Topology Visualizer */
              <div className="flex items-center gap-4 p-4 overflow-x-auto bg-white/[0.01] border border-white/5 rounded-2xl relative">
                {/* OLT head */}
                <div className="flex-shrink-0 flex flex-col items-center justify-center text-center p-3 bg-primary/10 border border-primary/20 rounded-xl min-w-[70px]">
                  <span className="text-[9px] text-muted-foreground font-bold">OLT CO</span>
                  <span className="text-xs font-bold text-primary">{txPower.toFixed(1)} dBm</span>
                </div>

                {/* Nodes chain */}
                {busNodes.map((node, idx) => {
                  const nodeRes = busResults[idx]
                  const isLast = idx === busNodes.length - 1
                  const isSelected = node.id === selectedNodeId
                  const clientRx = nodeRes?.rxPower.toFixed(1) || "—"
                  
                  const statusBorder =
                    nodeRes?.status === "safe"
                      ? "border-emerald-500/25"
                      : nodeRes?.status === "warning"
                        ? "border-amber-500/25"
                        : "border-red-500/25"

                  return (
                    <div key={node.id} className="flex items-center flex-shrink-0 gap-3">
                      {/* Connection Fiber Cable line */}
                      <div className="flex flex-col items-center justify-center">
                        <div className="h-0.5 w-10 bg-neutral-700" />
                        <span className="text-[8px] text-muted-foreground mt-1 font-semibold">{node.distance} km</span>
                      </div>

                      {/* Node Box */}
                      <button
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        className={cn(
                          "p-3 rounded-xl border flex flex-col items-start gap-1 w-[140px] text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : cn("border-white/10 bg-white/[0.01] hover:border-white/20", statusBorder)
                        )}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[10px] font-bold text-foreground">{node.name}</span>
                          <span className="text-[8px] text-muted-foreground bg-white/[0.04] px-1 rounded">
                            Tap {node.tapRatio}
                          </span>
                        </div>
                        <div className="w-full h-px bg-white/5 my-1" />
                        <div className="text-[9px] text-muted-foreground">
                          In: <span className="text-foreground font-bold">{nodeRes?.inputPower.toFixed(1)} dBm</span>
                        </div>
                        
                        {/* Splitter local output */}
                        <div className="text-[9px] text-muted-foreground">
                          Local ({node.localSplitter}): <span className={cn("font-bold", 
                            nodeRes?.status === "safe" ? "text-emerald-400" : nodeRes?.status === "warning" ? "text-amber-400" : "text-red-400"
                          )}>{clientRx} dBm</span>
                        </div>

                        {/* Exiting line */}
                        {!isLast && (
                          <div className="text-[9px] text-muted-foreground">
                            Out: <span className="text-foreground font-bold">{nodeRes?.throughPower.toFixed(1)} dBm</span>
                          </div>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Results */}
        <div className="space-y-6">
          {topology === "star" ? (
            /* Star Results Card */
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-card/30 p-6 backdrop-blur-md text-center relative overflow-hidden">
                <div
                  className={cn(
                    "absolute inset-0 pointer-events-none opacity-5 blur-3xl transition-colors duration-300",
                    starResults.status === "safe"
                      ? "bg-primary"
                      : starResults.status === "warning"
                        ? "bg-amber-500"
                        : "bg-red-500"
                  )}
                />
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                  {t.rxEstimated}
                </span>
                <div
                  className={cn(
                    "text-4xl sm:text-5xl font-extrabold tracking-tight mt-2.5 transition-colors",
                    starResults.status === "safe"
                      ? "text-primary animate-pulse-glow"
                      : starResults.status === "warning"
                        ? "text-amber-400"
                        : "text-red-400"
                  )}
                >
                  {starResults.rxPower.toFixed(2)} <span className="text-lg font-normal text-muted-foreground">dBm</span>
                </div>

                <div className="mt-4 flex justify-center">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                      starResults.status === "safe"
                        ? "bg-primary/10 border-primary/20 text-primary"
                        : starResults.status === "warning"
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                          : "bg-red-500/10 border-red-500/20 text-red-400"
                    )}
                  >
                    {starResults.status === "safe" ? (
                      <CheckCircle className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    )}
                    {starResults.message}
                  </span>
                </div>

                <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                  Target operating window for {selectedStandard.label} is between **{selectedStandard.rxMin.toFixed(1)} dBm** and **{selectedStandard.rxMax.toFixed(1)} dBm**.
                </p>
              </div>

              {/* Star Loss Breakdown */}
              <div className="rounded-2xl border border-white/10 bg-card/30 p-6 backdrop-blur-md space-y-4">
                <h3 className="text-sm font-bold border-b border-white/10 pb-2 flex items-center justify-between">
                  <span>{t.breakdown}</span>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t.fiberLoss} ({activeWavelength.lossPerKm} dB/km)</span>
                    <span className="font-semibold text-foreground">-{starResults.fiberLoss.toFixed(2)} dB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t.spliceLoss} ({starSplices} × 0.05 dB)</span>
                    <span className="font-semibold text-foreground">-{starResults.spliceLoss.toFixed(2)} dB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t.connectorLoss} ({starConnectors} × 0.25 dB)</span>
                    <span className="font-semibold text-foreground">-{starResults.connectorLoss.toFixed(2)} dB</span>
                  </div>
                  {starSplitter1 !== "None" && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t.splitter(1)} ({starSplitter1})</span>
                      <span className="font-semibold text-foreground">-{starResults.s1Loss.toFixed(1)} dB</span>
                    </div>
                  )}
                  {starSplitter2 !== "None" && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t.splitter(2)} ({starSplitter2})</span>
                      <span className="font-semibold text-foreground">-{starResults.s2Loss.toFixed(1)} dB</span>
                    </div>
                  )}
                  {starSplitter3 !== "None" && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t.splitter(3)} ({starSplitter3})</span>
                      <span className="font-semibold text-foreground">-{starResults.s3Loss.toFixed(1)} dB</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Safety / Repair Margin</span>
                    <span className="font-semibold text-foreground">-{safetyMargin.toFixed(2)} dB</span>
                  </div>

                  <div className="flex justify-between items-center pt-2.5 border-t border-white/10 font-bold text-foreground">
                    <span>{t.totalLoss}</span>
                    <span className="text-primary">-{starResults.totalLoss.toFixed(2)} dB</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Bus Results Summary Table */
            <div className="rounded-2xl border border-white/10 bg-card/30 p-6 backdrop-blur-md space-y-4">
              <h3 className="text-sm font-bold border-b border-white/10 pb-2">
                Daisy-Chain Node Power Summary
              </h3>

              <div className="space-y-3.5">
                {busResults.map((nodeRes, idx) => {
                  const statusBadge =
                    nodeRes.status === "safe"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : nodeRes.status === "warning"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-red-500/10 text-red-400 border-red-500/20"

                  return (
                    <div
                      key={nodeRes.id}
                      className={cn(
                        "p-4 rounded-xl border transition-all flex justify-between items-center gap-3",
                        selectedNodeId === nodeRes.id
                          ? "border-primary bg-primary/[0.04]"
                          : "border-white/5 bg-white/[0.01]"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{nodeRes.name}</span>
                          <span className="text-[8px] text-muted-foreground bg-white/[0.04] px-1 rounded font-semibold">
                            Tap {nodeRes.tapRatio}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-none">
                          In: {nodeRes.inputPower.toFixed(1)} dBm | Out:{" "}
                          {idx === busNodes.length - 1 ? "Terminated" : `${nodeRes.throughPower.toFixed(1)} dBm`}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={cn("text-xs font-bold px-2 py-0.5 rounded-full border inline-block", statusBadge)}>
                          {nodeRes.rxPower.toFixed(1)} dBm
                        </div>
                        <div className="text-[8px] text-muted-foreground mt-1">
                          Local Splitter: {nodeRes.localSplitter}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Standards Reference Card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.01] p-5 space-y-3">
            <h4 className="text-xs font-bold flex items-center gap-1.5 text-foreground uppercase tracking-wider">
              <Info className="h-4.5 w-4.5 text-primary" />
              {t.guidelines}
            </h4>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-2 leading-relaxed">
              <li>
                <strong>Splitter Loss Rules of Thumb</strong>: Standard PLC Splitters incur ~3 dB loss per 1:2 split (1:2 = 3.5dB, 1:4 = 7.2dB, 1:8 = 10.5dB, 1:16 = 13.8dB).
              </li>
              <li>
                <strong>Daisy-Chained Tap Ratios</strong>: Always put lower tap percentages (e.g. 5/95, 10/90) closer to the OLT where signal is high, and larger split percentages (e.g. 30/70, 50/50) at the end of the chain.
              </li>
              <li>
                <strong>Safety Margins</strong>: Keep a safety margin of 2.0 to 3.0 dB to plan for aging, future restoration splicing, and mechanical fiber stress.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
