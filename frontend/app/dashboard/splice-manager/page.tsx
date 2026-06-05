"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Scissors,
  Printer,
  Download,
  Info,
  Settings,
  AlertTriangle,
  CheckCircle2,
  Search,
  RefreshCw,
  FileText,
  Layers,
  Palette,
  ArrowRight,
} from "lucide-react"

// Color Coding Sequences
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
  { id: 2, name: "Jingga", hex: "#f97316", textHex: "#000000" },
  { id: 3, name: "Hijau", hex: "#22c55e", textHex: "#ffffff" },
  { id: 4, name: "Cokelat", hex: "#a16207", textHex: "#ffffff" },
  { id: 5, name: "Abu-abu", hex: "#6b7280", textHex: "#ffffff" },
  { id: 6, name: "Putih", hex: "#ffffff", textHex: "#000000" },
  { id: 7, name: "Merah", hex: "#ef4444", textHex: "#ffffff" },
  { id: 8, name: "Hitam", hex: "#000000", textHex: "#ffffff" },
  { id: 9, name: "Kuning", hex: "#eab308", textHex: "#000000" },
  { id: 10, name: "Ungu", hex: "#a855f7", textHex: "#ffffff" },
  { id: 11, name: "Pink", hex: "#ec4899", textHex: "#ffffff" },
  { id: 12, name: "Toska", hex: "#06b6d4", textHex: "#000000" },
]

const capacities = [12, 24, 48, 96, 144, 288]

export default function SpliceManagerPage() {
  // 1. Parameter State variables
  const [fdtName, setFdtName] = useState<string>("ODC-MJK-FA")
  const [capacity, setCapacity] = useState<number>(96)
  const [numFat, setNumFat] = useState<number>(12)
  const [coresPerFat, setCoresPerFat] = useState<number>(1)
  const [fatBaseName, setFatBaseName] = useState<string>("ODP-MJK-FA/")
  const [standard, setStandard] = useState<"Telkom" | "TIA">("Telkom")
  const [startCore, setStartCore] = useState<number>(1)
  const [coresPerTube, setCoresPerTube] = useState<number>(12)
  const [fatCoreScheme, setFatCoreScheme] = useState<"all_active" | "active_backup">("active_backup")

  // 2. Tab & Search Filter states
  const [activeTab, setActiveTab] = useState<"fdt" | "fat">("fdt")
  const [searchQuery, setSearchQuery] = useState<string>("")

  // 3. Helper to fetch color based on core number in tube & standard
  const activeColors = useMemo(() => {
    return standard === "TIA" ? colorSequenceEn : colorSequenceId
  }, [standard])

  const getTubeAndCoreColors = (globalCore: number) => {
    // 1-based indexing for calculations
    const tubeIndex = Math.ceil(globalCore / coresPerTube)
    const coreIndexInTube = ((globalCore - 1) % coresPerTube) + 1

    const tubeColorObj = activeColors[(tubeIndex - 1) % 12]
    const coreColorObj = activeColors[coreIndexInTube - 1]

    return {
      tubeIndex,
      tubeName: tubeColorObj.name,
      tubeHex: tubeColorObj.hex,
      tubeTextHex: tubeColorObj.textHex,
      coreIndexInTube,
      coreName: coreColorObj.name,
      coreHex: coreColorObj.hex,
      coreTextHex: coreColorObj.textHex,
    }
  }

  // 4. Splicing logic: FDT Core centric view data mapping
  const fdtSplicingRows = useMemo(() => {
    const rows = []
    const totalAllocatedCores = numFat * coresPerFat

    for (let c = 1; c <= capacity; c++) {
      const colors = getTubeAndCoreColors(c)
      let fatName = ""
      let fatCoreTarget = ""
      let status: "Active" | "Backup" | "Spare" = "Spare"

      // Check if this FDT core is inside the range of active distribution splicing
      if (c >= startCore && c < startCore + totalAllocatedCores) {
        const offset = c - startCore
        const fatIndex = Math.floor(offset / coresPerFat) + 1
        const fatCoreIndex = (offset % coresPerFat) + 1

        const paddedFatIndex = fatIndex.toString().padStart(2, "0")
        fatName = `${fatBaseName}${paddedFatIndex}`
        
        if (coresPerFat === 2 && fatCoreScheme === "active_backup" && fatCoreIndex === 2) {
          fatCoreTarget = "Core 2 (Idle/Backup)"
          status = "Backup"
        } else {
          fatCoreTarget = coresPerFat === 2 && fatCoreScheme === "active_backup" && fatCoreIndex === 1
            ? "Core 1 (Aktif/Splitter)"
            : `Core ${fatCoreIndex}`
          status = "Active"
        }
      }

      rows.push({
        fdtCore: c,
        ...colors,
        fatName,
        fatCoreTarget,
        status,
      })
    }

    return rows
  }, [capacity, numFat, coresPerFat, fatBaseName, startCore, coresPerTube, activeColors, fatCoreScheme])

  // 5. Splicing logic: FAT Box centric view data mapping
  const fatBoxesRows = useMemo(() => {
    const rows = []

    for (let i = 1; i <= numFat; i++) {
      const paddedFatIndex = i.toString().padStart(2, "0")
      const fatName = `${fatBaseName}${paddedFatIndex}`
      const allocatedCoresList = []

      // Determine which FDT cores map to this FAT box
      for (let k = 0; k < coresPerFat; k++) {
        const relativeCoreOffset = (i - 1) * coresPerFat + k
        const globalFdtCore = startCore + relativeCoreOffset
        const isExceedingCable = globalFdtCore > capacity

        let colorsInfo = null
        if (!isExceedingCable) {
          colorsInfo = getTubeAndCoreColors(globalFdtCore)
        }

        let coreStatus: "Active" | "Backup" = "Active"
        if (coresPerFat === 2 && fatCoreScheme === "active_backup" && k === 1) {
          coreStatus = "Backup"
        }

        allocatedCoresList.push({
          fatCoreIndex: k + 1,
          fdtCore: globalFdtCore,
          isExceedingCable,
          coreStatus,
          ...colorsInfo,
        })
      }

      rows.push({
        fatIndex: i,
        fatName,
        allocatedCores: allocatedCoresList,
      })
    }

    return rows
  }, [capacity, numFat, coresPerFat, fatBaseName, startCore, coresPerTube, activeColors, fatCoreScheme])

  // 6. Filtering lists based on search query
  const filteredFdtRows = useMemo(() => {
    if (!searchQuery.trim()) return fdtSplicingRows
    const query = searchQuery.toLowerCase()
    return fdtSplicingRows.filter(
      (r) =>
        r.fdtCore.toString().includes(query) ||
        r.tubeName.toLowerCase().includes(query) ||
        r.coreName.toLowerCase().includes(query) ||
        r.fatName.toLowerCase().includes(query) ||
        r.status.toLowerCase().includes(query)
    )
  }, [fdtSplicingRows, searchQuery])

  const filteredFatRows = useMemo(() => {
    if (!searchQuery.trim()) return fatBoxesRows
    const query = searchQuery.toLowerCase()
    return fatBoxesRows.filter(
      (r) =>
        r.fatName.toLowerCase().includes(query) ||
        r.allocatedCores.some(
          (c) =>
            c.fdtCore.toString().includes(query) ||
            (!c.isExceedingCable &&
              (c.tubeName?.toLowerCase().includes(query) ||
                c.coreName?.toLowerCase().includes(query)))
        )
    )
  }, [fatBoxesRows, searchQuery])

  // 7. Splicing summary metrics
  const summaryMetrics = useMemo(() => {
    const totalAllocated = numFat * coresPerFat
    const spares = Math.max(0, capacity - totalAllocated)
    const tubesUsed = Math.ceil(Math.min(capacity, totalAllocated) / coresPerTube)
    const exceedsCapacity = totalAllocated > capacity

    return {
      totalAllocated,
      spares,
      tubesUsed,
      exceedsCapacity,
      totalActiveFats: numFat,
    }
  }, [capacity, numFat, coresPerFat, coresPerTube])

  // Reset inputs to default values helper
  const handleReset = () => {
    setFdtName("ODC-MJK-FA")
    setCapacity(96)
    setNumFat(12)
    setCoresPerFat(1)
    setFatBaseName("ODP-MJK-FA/")
    setStandard("Telkom")
    setStartCore(1)
    setCoresPerTube(12)
    setFatCoreScheme("active_backup")
    setSearchQuery("")
  }

  // Client-side CSV Exporter
  const handleExportCSV = () => {
    const headers = [
      "No Core FDT",
      "No Tube",
      "Warna Tube",
      "No Core in Tube",
      "Warna Core",
      "Alokasi FAT",
      "Target Core FAT",
      "Status",
    ]

    const csvRows = fdtSplicingRows.map((r) => [
      r.fdtCore,
      r.tubeIndex,
      r.tubeName,
      r.coreIndexInTube,
      r.coreName,
      r.fatName || "-",
      r.fatCoreTarget || "-",
      r.status,
    ])

    const csvContent = [headers.join(","), ...csvRows.map((e) => e.map((val) => `"${val}"`).join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `tabel_splicing_${fdtName || "FDT"}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      {/* Dynamic injection of CSS for custom prints to avoid cluttering main layout */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            body {
              background: white !important;
              color: black !important;
            }
            header, footer, nav, aside, .no-print {
              display: none !important;
            }
            .print-card {
              background: transparent !important;
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
            }
            .print-table {
              width: 100% !important;
              border-collapse: collapse !important;
              color: black !important;
              font-size: 11px !important;
            }
            .print-table th {
              background-color: #f3f4f6 !important;
              color: black !important;
              border: 1px solid #000000 !important;
              padding: 6px !important;
              font-weight: bold !important;
            }
            .print-table td {
              border: 1px solid #000000 !important;
              color: black !important;
              background-color: transparent !important;
              padding: 6px !important;
            }
            .print-badge {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              border: 1px solid #000000 !important;
              padding: 2px 4px !important;
              border-radius: 4px !important;
              font-size: 10px !important;
              font-weight: bold !important;
              display: inline-block !important;
            }
            .print-title {
              display: block !important;
              margin-bottom: 20px !important;
              text-align: center !important;
            }
          }
        `
      }} />

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-3">
            <Scissors className="h-7 w-7 text-primary" />
            Splice Joint Manager
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Alokasikan core distribusi FDT (ODC) ke box FAT (ODP) secara dinamis dengan visualisasi warna standar TIA-598 atau Telkom.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="h-10 px-4 rounded-xl text-sm font-medium border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition-colors cursor-pointer flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Reset
          </button>
          <button
            onClick={handleExportCSV}
            className="h-10 px-4 rounded-xl text-sm font-medium border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition-colors cursor-pointer flex items-center gap-2 text-primary"
          >
            <Download className="h-4 w-4" />
            Ekspor CSV
          </button>
          <button
            onClick={() => window.print()}
            className="h-10 px-4 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Printer className="h-4 w-4" />
            Cetak PDF
          </button>
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_2fr] gap-6 items-start">
        
        {/* Left Side: Parameters Settings Form */}
        <div className="space-y-6 no-print">
          <div className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm space-y-6">
            <h2 className="text-lg font-medium flex items-center gap-2 text-foreground">
              <Settings className="h-5 w-5 text-primary" />
              Parameter Konfigurasi
            </h2>

            {/* FDT & standard settings */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Nama FDT (ODC)</label>
                <input
                  type="text"
                  value={fdtName}
                  onChange={(e) => setFdtName(e.target.value)}
                  placeholder="Contoh: ODC-MJK-FA"
                  className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30 text-foreground"
                />
              </div>

              {/* Standard Selection */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Standar Kode Warna</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStandard("Telkom")}
                    className={`h-9 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
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
                    className={`h-9 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      standard === "TIA"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white/[0.03] text-muted-foreground border-white/10 hover:border-white/20"
                    }`}
                  >
                    TIA-598-C
                  </button>
                </div>
              </div>

              {/* Cable Capacity & Core per Tube */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Kapasitas Core Kabel</label>
                  <select
                    value={capacity}
                    onChange={(e) => {
                      const cap = Number(e.target.value)
                      setCapacity(cap)
                      if (startCore > cap) setStartCore(1)
                    }}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30 text-foreground bg-neutral-900"
                  >
                    {capacities.map((c) => (
                      <option key={c} value={c} className="bg-neutral-900 text-foreground">
                        {c} Core
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Core per Tube</label>
                  <select
                    value={coresPerTube}
                    onChange={(e) => setCoresPerTube(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30 text-foreground bg-neutral-900"
                  >
                    <option value={12} className="bg-neutral-900 text-foreground">12 (Standar)</option>
                    <option value={6} className="bg-neutral-900 text-foreground">6 (Legacy)</option>
                    <option value={24} className="bg-neutral-900 text-foreground">24 (High Density)</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-white/10 my-4" />

              {/* FAT allocation settings */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Prefix Nama FAT (ODP)</label>
                <input
                  type="text"
                  value={fatBaseName}
                  onChange={(e) => setFatBaseName(e.target.value)}
                  placeholder="Contoh: ODP-MJK-FA/"
                  className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30 text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Jumlah FAT (ODP)</label>
                  <input
                    type="number"
                    min="1"
                    max="144"
                    value={numFat || ""}
                    onChange={(e) => setNumFat(Math.min(144, Math.max(1, Number(e.target.value))))}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30 text-foreground"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Core per FAT</label>
                  <select
                    value={coresPerFat}
                    onChange={(e) => setCoresPerFat(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30 text-foreground bg-neutral-900"
                  >
                    <option value={1} className="bg-neutral-900 text-foreground">1 Core</option>
                    <option value={2} className="bg-neutral-900 text-foreground">2 Core</option>
                  </select>
                </div>
              </div>

              {coresPerFat === 2 && (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <label className="text-xs text-muted-foreground font-medium">Skema Core FAT (2 Core)</label>
                  <select
                    value={fatCoreScheme}
                    onChange={(e) => setFatCoreScheme(e.target.value as "all_active" | "active_backup")}
                    className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30 text-foreground bg-neutral-900"
                  >
                    <option value="active_backup" className="bg-neutral-900 text-foreground">1 Aktif (Splitter 1:16), 1 Idle (Backup)</option>
                    <option value="all_active" className="bg-neutral-900 text-foreground">Semua Aktif (Misal: 2 Splitter)</option>
                  </select>
                </div>
              )}

              {/* Splicing start core */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Mulai Dari Core FDT (Start Core)</label>
                <input
                  type="number"
                  min="1"
                  max={capacity}
                  value={startCore || ""}
                  onChange={(e) => setStartCore(Math.min(capacity, Math.max(1, Number(e.target.value))))}
                  className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm focus:outline-none focus:border-white/30 text-foreground"
                />
              </div>
            </div>

            {/* Error alerts */}
            {summaryMetrics.exceedsCapacity && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 flex gap-3 text-xs text-rose-300">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
                <div className="space-y-1">
                  <span className="font-semibold">Kapasitas Kabel Melebihi Batas!</span>
                  <p className="leading-relaxed opacity-90">
                    Total core yang dibutuhkan ({summaryMetrics.totalAllocated} core) melebihi kapasitas kabel ({capacity} core). Beberapa box FAT tidak akan mendapatkan alokasi core.
                  </p>
                </div>
              </div>
            )}

            {/* Info guides */}
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-3 text-xs text-muted-foreground space-y-1.5">
              <span className="font-semibold text-foreground block">Mnemonic Kode Warna ({standard}):</span>
              {standard === "Telkom" ? (
                <p className="font-mono text-[11px] leading-relaxed">
                  Biru, Jingga, Hijau, Cokelat, Abu-abu, Putih, Merah, Hitam, Kuning, Ungu, Pink, Toska.
                </p>
              ) : (
                <p className="font-mono text-[11px] leading-relaxed">
                  Blue, Orange, Green, Brown, Slate, White, Red, Black, Yellow, Violet, Rose, Aqua.
                </p>
              )}
            </div>
          </div>

          {/* Quick Info Box Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-card/40 p-4 backdrop-blur-sm text-center">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Core Terpasang</span>
              <div className="text-xl font-bold mt-1 text-primary">{Math.min(capacity, summaryMetrics.totalAllocated)} C</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-card/40 p-4 backdrop-blur-sm text-center">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Core Cadangan (Spare)</span>
              <div className="text-xl font-bold mt-1 text-foreground">{summaryMetrics.spares} C</div>
            </div>
          </div>
        </div>

        {/* Right Side: Output Tables */}
        <div className="space-y-6 print-card">
          
          {/* Print Title (Hidden on screen) */}
          <div className="hidden print-title text-center text-black">
            <h1 className="text-xl font-bold">TABEL SPLICING FIBER OPTIC</h1>
            <p className="text-sm">FDT (ODC): {fdtName} | Kapasitas: {capacity} Core | Standar Warna: {standard}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm space-y-6 print-card">
            
            {/* Header of tables - Tabs and Search */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
              {/* Tab Selector */}
              <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/10 self-start">
                <button
                  onClick={() => {
                    setActiveTab("fdt")
                    setSearchQuery("")
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "fdt"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Tabel Core FDT ({capacity}C)
                </button>
                <button
                  onClick={() => {
                    setActiveTab("fat")
                    setSearchQuery("")
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "fat"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Tabel Box FAT ({numFat} ODP)
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder={activeTab === "fdt" ? "Cari core, warna, ODP..." : "Cari ODP, core..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-white/10 bg-white/[0.03] text-xs focus:outline-none focus:border-white/30 text-foreground"
                />
              </div>
            </div>

            {/* Warning if no data matches search */}
            {((activeTab === "fdt" && filteredFdtRows.length === 0) ||
              (activeTab === "fat" && filteredFatRows.length === 0)) && (
              <div className="text-center py-12 text-muted-foreground">
                <p>Tidak ada baris data yang cocok dengan pencarian Anda.</p>
              </div>
            )}

            {/* Tab 1: FDT Core Centric View Table */}
            {activeTab === "fdt" && filteredFdtRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse print-table">
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground text-xs font-semibold uppercase">
                      <th className="py-3 px-4 w-[90px]">Core FDT</th>
                      <th className="py-3 px-4 w-[160px]">Tube No & Warna</th>
                      <th className="py-3 px-4 w-[160px]">Core No & Warna</th>
                      <th className="py-3 px-4">Alokasi FAT</th>
                      <th className="py-3 px-4 w-[120px]">Target</th>
                      <th className="py-3 px-4 text-right w-[100px] no-print">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFdtRows.map((row) => (
                      <tr
                        key={row.fdtCore}
                        className={`border-b border-white/5 transition-colors duration-150 ${
                          row.status === "Active"
                            ? "hover:bg-primary/[0.02] bg-primary/[0.01]"
                            : row.status === "Backup"
                            ? "hover:bg-amber-500/[0.02] bg-amber-500/[0.01]"
                            : "hover:bg-white/[0.01] opacity-75"
                        }`}
                      >
                        {/* Core FDT */}
                        <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                          {row.fdtCore.toString().padStart(2, "0")}
                        </td>

                        {/* Tube Color Badge */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-4 w-7 rounded-sm border border-white/20 inline-block shadow-inner print-badge"
                              style={{ backgroundColor: row.tubeHex }}
                            />
                            <span className="font-medium text-foreground text-xs">
                              {row.tubeIndex} - {row.tubeName}
                            </span>
                          </div>
                        </td>

                        {/* Core Color Badge */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-4 w-7 rounded-sm border border-white/20 inline-block shadow-inner print-badge"
                              style={{ backgroundColor: row.coreHex }}
                            />
                            <span className="font-medium text-foreground text-xs">
                              {row.coreIndexInTube} - {row.coreName}
                            </span>
                          </div>
                        </td>

                        {/* FAT Target box */}
                        <td className="py-3.5 px-4">
                          {row.fatName ? (
                            <div className="font-semibold text-primary flex items-center gap-1">
                              <span>{row.fatName}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs font-light font-mono">
                              - (Cadangan)
                            </span>
                          )}
                        </td>

                        {/* Core inside FAT target */}
                        <td className="py-3.5 px-4 text-xs font-medium text-foreground">
                          {row.fatCoreTarget || "-"}
                        </td>

                        {/* Status badge */}
                        <td className="py-3.5 px-4 text-right no-print">
                          {row.status === "Active" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3 w-3" />
                              Active
                            </span>
                          ) : row.status === "Backup" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                              <Info className="h-3 w-3" />
                              Idle/Backup
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-white/[0.02] border border-white/5 px-2 py-0.5 rounded-full">
                              Spare
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 2: FAT Box Centric View Table */}
            {activeTab === "fat" && filteredFatRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse print-table">
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground text-xs font-semibold uppercase">
                      <th className="py-3 px-4 w-[160px]">Nama Box FAT</th>
                      <th className="py-3 px-4 w-[100px]">Core ODP</th>
                      <th className="py-3 px-4">Koneksi Splicing FDT</th>
                      <th className="py-3 px-4">Detail Warna Core FDT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFatRows.map((row) => (
                      <tr
                        key={row.fatIndex}
                        className="border-b border-white/5 hover:bg-white/[0.01]"
                      >
                        {/* FAT Name */}
                        <td className="py-4 px-4 font-semibold text-primary align-top">
                          {row.fatName}
                        </td>

                        {/* Dynamic core mapping lists */}
                        <td className="py-4 px-4 align-top" colSpan={3}>
                          <div className="divide-y divide-white/5 w-full">
                            {row.allocatedCores.map((ac) => (
                              <div
                                key={ac.fatCoreIndex}
                                className="flex flex-col sm:flex-row sm:items-center py-2 first:pt-0 last:pb-0 gap-4"
                              >
                                <span className="text-xs font-medium text-muted-foreground w-24 shrink-0 flex items-center gap-1.5">
                                  Core #{ac.fatCoreIndex}
                                  {!ac.isExceedingCable && (
                                    ac.coreStatus === "Backup" ? (
                                      <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase shrink-0">Idle</span>
                                    ) : (
                                      <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase shrink-0">Aktif</span>
                                    )
                                  )}
                                </span>
                                
                                {ac.isExceedingCable ? (
                                  <span className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Tidak Terkoneksi (Kapasitas Cable Habis)
                                  </span>
                                ) : (
                                  <>
                                    <span className="font-mono text-foreground font-bold w-20 shrink-0 text-sm">
                                      Core {ac.fdtCore.toString().padStart(2, "0")} FDT
                                    </span>
                                    <div className="flex flex-wrap items-center gap-4 text-xs">
                                      <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">Tube:</span>
                                        <span
                                          className="h-3.5 w-6 rounded-sm border border-white/20 inline-block print-badge"
                                          style={{ backgroundColor: ac.tubeHex }}
                                        />
                                        <span className="font-medium text-foreground font-sans">
                                          {ac.tubeIndex} - {ac.tubeName}
                                        </span>
                                      </div>
                                      <ArrowRight className="h-3 w-3 text-muted-foreground hidden sm:block" />
                                      <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">Core:</span>
                                        <span
                                          className="h-3.5 w-6 rounded-sm border border-white/20 inline-block print-badge"
                                          style={{ backgroundColor: ac.coreHex }}
                                        />
                                        <span className="font-medium text-foreground font-sans">
                                          {ac.coreIndexInTube} - {ac.coreName}
                                        </span>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Educational Help Footer Card */}
            <div className="border-t border-white/10 pt-6 no-print">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
                <Info className="h-3.5 w-3.5 text-primary" />
                Cara Membaca Splicing Joint Manager:
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4 leading-relaxed">
                <li>Kolom <strong>Core FDT</strong> menunjukkan nomor core fisik pada kabel distribusi.</li>
                <li>Setiap Tube berisi <strong>{coresPerTube} core</strong>. Contoh: Core 13 diletakkan di Tube #2 (Oranye) Core ke-1 (Biru).</li>
                <li>Bila core dipetakan ke FAT, ia akan tercatat sebagai status <strong className="text-emerald-400">Active</strong> dan target splicing ODP-nya akan tertera.</li>
                <li><strong>Cetak PDF</strong> akan menghasilkan selembar kertas A4 siap cetak yang ramah printer tinta dengan warna latar belakang putih bersih secara otomatis.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
