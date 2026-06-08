"use client"

import React, { useCallback, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getSupabaseClient } from "@/lib/supabase/client"
import { jobApi } from "@/lib/api"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useUpgradeModal } from "@/components/upgrade-modal"

type Status = "idle" | "uploading" | "processing" | "success" | "error"

interface UploadFile {
  file: File
  progress: number
}

export default function InsertCodingPage() {
  const [primary, setPrimary] = useState<UploadFile | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [progressMessage, setProgressMessage] = useState<string>("")

  // FDT Prefixes
  const [prefixFdt01, setPrefixFdt01] = useState<string>("")
  const [prefixFdt02, setPrefixFdt02] = useState<string>("")
  const [prefixFdt03, setPrefixFdt03] = useState<string>("")

  const primaryInputRef = useRef<HTMLInputElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollStartTimeRef = useRef<number>(0)
  const POLL_TIMEOUT_MS = 3 * 60 * 1000 // 3 minute timeout

  const { canAccess } = useFeatureAccess()
  const { showUpgradeModal } = useUpgradeModal()
  
  // Gate behind kml_to_boq feature key (Pro plan)
  const isLocked = !canAccess("kml_to_boq")

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [])

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    setPrimary({ file, progress: 100 })
    setStatus("idle")
    setErrorMsg(null)
    setJobId(null)
    setResultUrl(null)
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isLocked) {
      showUpgradeModal("kml_to_boq")
      return
    }
    handleFiles(e.dataTransfer.files)
  }

  const handleProcess = async () => {
    if (!primary || isLocked) return

    if (!prefixFdt01.trim()) {
      setErrorMsg("Prefix FDT 01 wajib diisi.")
      return
    }

    setStatus("uploading")
    setProgress(0)
    setErrorMsg(null)

    try {
      const supabase = getSupabaseClient()
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error("User tidak terautentikasi")

      const fileExt = primary.file.name.split('.').pop()
      const fileName = `${crypto.randomUUID()}.${fileExt}`
      const filePath = `${userData.user.id}/${fileName}`

      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(filePath, primary.file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) throw uploadError

      setStatus("processing")
      setProgress(5)

      // 2. Create Job in Supabase with Prefixes Configuration
      const newJobId = crypto.randomUUID()
      const { error: insertError } = await supabase.from('processing_jobs').insert({
        id: newJobId,
        user_id: userData.user.id,
        tool_name: 'insert_coding',
        original_filename: primary.file.name,
        original_file_url: filePath,
        original_file_size_bytes: primary.file.size,
        status: 'queued',
        config: {
          prefix_fdt_01: prefixFdt01.trim(),
          prefix_fdt_02: prefixFdt02.trim(),
          prefix_fdt_03: prefixFdt03.trim()
        }
      })

      if (insertError) throw insertError

      setJobId(newJobId)

      // 3. Trigger Backend Processing
      const triggerRes = await jobApi.submitJob({
        job_id: newJobId,
        file_path: filePath,
        original_filename: primary.file.name,
        user_id: userData.user.id,
        tool_name: 'insert_coding',
      })

      if (!triggerRes.success) {
        throw new Error(triggerRes.error?.message || "Gagal mengirimkan pekerjaan ke antrean")
      }

      // 4. Start Polling
      startPolling(newJobId)

    } catch (err: any) {
      console.error(err)
      setStatus("error")
      setErrorMsg(err.message || "Gagal memproses file")
    }
  }

  const startPolling = (id: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    pollStartTimeRef.current = Date.now()

    pollIntervalRef.current = setInterval(async () => {
      try {
        const elapsed = Date.now() - pollStartTimeRef.current
        if (elapsed > POLL_TIMEOUT_MS) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setStatus("error")
          setErrorMsg("Waktu proses habis — backend tidak merespon. Silakan coba lagi.")
          return
        }

        const supabase = getSupabaseClient()
        const { data: job, error } = await supabase
          .from('processing_jobs')
          .select('*')
          .eq('id', id)
          .single()

        if (error || !job) return

        if (job.progress_message) {
          setProgressMessage(job.progress_message)
        }

        if (job.status === 'queued' || job.status === 'processing') {
          setProgress(prev => {
            if (job.progress_percent && job.progress_percent > 0) {
              return job.progress_percent
            }
            if (job.status === 'queued') {
              return prev < 15 ? prev + 1 : 15
            }
            const remaining = 90 - prev
            const increment = Math.max(1, Math.floor(remaining * 0.15))
            return Math.min(prev + increment, 90)
          })

          if (!progressMessage) {
            setProgressMessage(job.status === 'queued' ? 'Antrian...' : 'Sedang diproses...')
          }
        } else if (job.status === 'completed') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setStatus("success")
          setProgress(100)
          setProgressMessage('Selesai!')

          const finalUrl = job.output_file_url
          if (finalUrl) {
             const { data } = await supabase.storage.from('outputs').createSignedUrl(finalUrl, 3600)
             if (data?.signedUrl) {
                setResultUrl(data.signedUrl)
             }
          }
        } else if (job.status === 'failed') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setStatus("error")
          setErrorMsg(job.error_message || "Proses gagal di backend")
        }
      } catch (err) {
        console.error("Polling error:", err)
      }
    }, 2000)
  }

  const handleReset = () => {
    setPrimary(null)
    setStatus("idle")
    setProgress(0)
    setErrorMsg(null)
    setJobId(null)
    setResultUrl(null)
    setProgressMessage("")
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
  }

  const handleDownload = () => {
    if (resultUrl) {
       window.open(resultUrl, '_blank')
    }
  }

  // Locked UI representation
  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8 text-center border border-white/10 rounded-2xl bg-card/40 backdrop-blur-sm max-w-2xl mx-auto mt-12">
        <Layers className="h-12 w-12 text-amber-500 animate-pulse" />
        <h2 className="text-xl font-semibold text-foreground">KML/KMZ Insert Coding memerlukan plan Pro</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Silakan upgrade akun Anda ke Pro untuk menggunakan fitur penulisan ulang kode FDT, FAT, Kabel, dan New Pole ini.
        </p>
        <button
          onClick={() => showUpgradeModal("kml_to_boq")}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-semibold text-black hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
        >
          Upgrade to Pro
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 lg:gap-8 max-w-6xl">
      {/* Left side - description & params */}
      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
            KML/KMZ Insert Coding
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed text-pretty">
            Sisipkan dan perbarui kode penomoran FDT, FAT, Kabel/Distribusi, serta New Pole secara otomatis sesuai dengan pembagian FDT di file Anda.
          </p>
        </div>

        {/* Configuration parameters */}
        <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm space-y-4">
          <h2 className="text-sm font-medium">Pengaturan Prefix FDT</h2>
          <p className="text-xs text-muted-foreground">
            Masukkan prefix coding yang akan digunakan. Isi FDT 02 dan FDT 03 hanya jika file KML Anda berisi beberapa FDT.
          </p>
          
          <div className="space-y-3">
            <div>
              <label htmlFor="prefixFdt01" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Prefix FDT 01 (Wajib)
              </label>
              <input
                id="prefixFdt01"
                type="text"
                placeholder="Contoh: PGKB.032"
                value={prefixFdt01}
                onChange={(e) => setPrefixFdt01(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            
            <div>
              <label htmlFor="prefixFdt02" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Prefix FDT 02 (Opsional)
              </label>
              <input
                id="prefixFdt02"
                type="text"
                placeholder="Contoh: PGKB.033"
                value={prefixFdt02}
                onChange={(e) => setPrefixFdt02(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label htmlFor="prefixFdt03" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Prefix FDT 03 (Opsional)
              </label>
              <input
                id="prefixFdt03"
                type="text"
                placeholder="Contoh: PGKB.034"
                value={prefixFdt03}
                onChange={(e) => setPrefixFdt03(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm">
          <h2 className="text-sm font-medium">Format didukung</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            <li className="font-mono text-xs px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] text-muted-foreground">
              .kml
            </li>
            <li className="font-mono text-xs px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] text-muted-foreground">
              .kmz
            </li>
          </ul>
        </div>
      </aside>

      {/* Right side - Main upload card */}
      <div className="space-y-5">
        <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-base font-medium">Upload file KMZ/KML</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Tarik & lepas file Anda atau klik untuk menelusuri folder
            </p>
          </div>

          <div className="p-5 space-y-4">
            {/* Primary drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => primaryInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  primaryInputRef.current?.click()
                }
              }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 cursor-pointer transition-all",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
              )}
              aria-label="Upload file KML/KMZ"
            >
              <input
                ref={primaryInputRef}
                type="file"
                accept=".kml,.kmz"
                className="sr-only"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-background transition-all",
                  isDragging && "scale-110 border-primary/50",
                )}
              >
                <Upload className="h-5 w-5 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  Letakkan file KML/KMZ Anda di sini
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  atau klik untuk menelusuri — maksimal 50MB
                </p>
              </div>
            </div>

            {/* Selected file */}
            <AnimatePresence>
              {primary && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {primary.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(primary.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPrimary(null)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Hapus file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pt-2">
              {status === "uploading" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      Mengunggah ke Cloud...
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary/70 to-primary w-full animate-pulse" />
                  </div>
                </div>
              ) : status === "processing" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      {progressMessage || "Sedang memproses..."}
                    </span>
                    <span className="font-mono">{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500/70 to-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={!primary || status === "success"}
                  className={cn(
                    "w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                    primary && status !== "success"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-white/5 text-muted-foreground cursor-not-allowed",
                  )}
                >
                  Proses File
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Result alerts */}
        <AnimatePresence>
          {status === "success" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="rounded-2xl border border-primary/30 bg-primary/5 p-5 backdrop-blur-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/30">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium">Proses Berhasil</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    File KML/KMZ baru dengan coding yang telah disisipkan siap diunduh.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                    >
                      <Download className="h-4 w-4" />
                      Unduh Hasil
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm hover:border-white/30 transition-colors cursor-pointer"
                    >
                      Proses Lainnya
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {status === "error" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-1 ring-destructive/30">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-medium">Proses Gagal</h3>
                  <p className="mt-1 text-xs text-muted-foreground text-pretty">
                    {errorMsg || "Terjadi kesalahan. Silakan coba lagi."}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
