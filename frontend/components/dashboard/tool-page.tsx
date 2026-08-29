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
  FileSpreadsheet,
  Lock,
  Crown,
  Zap,
  ShieldAlert,
  Smartphone,
  Laptop,
  RotateCcw,
  PlayCircle,
  Wrench,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useUpgradeModal } from "@/components/upgrade-modal"
import type { FeatureKey } from "@/lib/features"
import { getSupabaseClient } from "@/lib/supabase/client"
import { jobApi } from "@/lib/api"
import { getDeviceFingerprint } from "@/lib/fingerprint"
import { YouTubePlayer } from "@/components/tutorial/youtube-player"
import { getTutorialBySlug } from "@/lib/tutorial-data"

interface ToolPageProps {
  title: string
  description: string
  acceptedFormats: string[]
  processingNotes: string[]
  /** Mime/extension hint for the primary upload, e.g. ".kml,.kmz" */
  primaryAccept?: string
  /** Whether to show the optional Excel template upload */
  supportsExcelTemplate?: boolean
  /** Feature key for plan gating */
  featureKey?: FeatureKey
  /** Explicit tool name to process */
  toolName?: string
  /** Optional client-side processor function */
  clientProcessor?: (file: File) => Promise<{ blob: Blob; filename: string }>
  /**
   * YouTube video ID for tutorial tab.
   * Alternatively, pass the tool slug and the ID will be looked up from tutorial-data.ts.
   * If neither is provided, no Tutorial tab is shown.
   */
  youtubeId?: string
  /** Tool slug used to auto-lookup tutorial data (e.g. "kml-boq") */
  tutorialSlug?: string
}

type Status = "idle" | "uploading" | "processing" | "success" | "error"

/** Sesuai file_size_limit bucket 'uploads' di supabase/03-storage.sql (50 MB). */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface UploadFile {
  file: File
  progress: number
}

export function ToolPage({
  title,
  description,
  acceptedFormats,
  processingNotes,
  primaryAccept = ".kml,.kmz",
  supportsExcelTemplate = true,
  featureKey,
  toolName,
  clientProcessor,
  youtubeId: youtubeIdProp,
  tutorialSlug,
}: ToolPageProps) {
  const [primary, setPrimary] = useState<UploadFile | null>(null)
  const [template, setTemplate] = useState<UploadFile | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [progressMessage, setProgressMessage] = useState<string>("")
  const [outputFilename, setOutputFilename] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"tool" | "tutorial">("tool")
  
  const primaryInputRef = useRef<HTMLInputElement>(null)
  const templateInputRef = useRef<HTMLInputElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollStartTimeRef = useRef<number>(0)
  // 15 menit. Batas 3 menit sebelumnya lebih pendek daripada waktu proses
  // sebenarnya: APD HPDB melakukan geocoding ~1,2 detik per titik, dan
  // Auto Placemark menembak Overpass API berkali-kali — job dengan ratusan
  // HP selalu dilaporkan "timeout" padahal sebenarnya berhasil.
  // Job yang benar-benar macet ditangani reaper di database (30 menit).
  const POLL_TIMEOUT_MS = 15 * 60 * 1000

  const { canAccess } = useFeatureAccess()
  const { showUpgradeModal } = useUpgradeModal()
  const isLocked = featureKey ? !canAccess(featureKey) : false

  // Resolve tutorial data: explicit prop > slug lookup > none
  const tutorialEntry = tutorialSlug ? getTutorialBySlug(tutorialSlug) : undefined
  const resolvedYoutubeId = youtubeIdProp || tutorialEntry?.youtubeId || ""
  const hasTutorial = resolvedYoutubeId.length > 0

  const [deviceBlocked, setDeviceBlocked] = useState(false)
  const [deviceBlockReason, setDeviceBlockReason] = useState<string>("")
  const [deviceBlockMsg, setDeviceBlockMsg] = useState<string>("")
  const [checkingDevice, setCheckingDevice] = useState(true)
  const [resettingDevices, setResettingDevices] = useState(false)
  const [locale, setLocale] = useState<"en" | "id">("en")

  React.useEffect(() => {
    const stored = localStorage.getItem("locale")
    if (stored === "id" || stored === "en") {
      setLocale(stored)
    }

    async function verifyDevice() {
      try {
        const supabase = getSupabaseClient()
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) {
          setCheckingDevice(false)
          return
        }

        const fp = getDeviceFingerprint()
        const { data: resData, error } = await supabase.rpc('check_device_registration', {
          p_device_hash: fp,
          p_user_id: userData.user.id
        })

        if (error) {
          console.error("Device registration check failed:", error)
          setDeviceBlocked(false)
        } else if (typeof resData === "boolean") {
          setDeviceBlocked(!resData)
        } else if (resData && typeof resData === "object" && !Array.isArray(resData)) {
          // check_device_registration mengembalikan jsonb, jadi TypeScript
          // melihatnya sebagai Json — perlu dipersempit sebelum diakses.
          const res = resData as {
            allowed?: boolean
            reason?: string
            message?: string
          }
          if (res.allowed === false) {
            setDeviceBlocked(true)
            setDeviceBlockReason(res.reason || "")
            setDeviceBlockMsg(res.message || "")
          } else {
            setDeviceBlocked(false)
          }
        } else {
          setDeviceBlocked(false)
        }
      } catch (err) {
        console.error("Failed to verify device registration:", err)
        setDeviceBlocked(false)
      } finally {
        setCheckingDevice(false)
      }
    }

    verifyDevice()
  }, [])

  const handleResetDevices = async () => {
    setResettingDevices(true)
    try {
      const supabase = getSupabaseClient()
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) return

      const { error } = await supabase.rpc('reset_user_devices', { p_user_id: userData.user.id })
      if (error) throw error

      window.location.reload()
    } catch (err: any) {
      console.error("Failed to reset devices:", err)
      alert(locale === "id" ? "Gagal mereset perangkat. Silakan coba lagi." : "Failed to reset devices. Please try again.")
    } finally {
      setResettingDevices(false)
    }
  }

  // Blob URL hasil clientProcessor harus direvoke, kalau tidak blob-nya
  // (bisa puluhan MB) tertahan di memori selama tab masih terbuka.
  const blobUrlRef = useRef<string | null>(null)

  const releaseBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  // Cleanup polling + blob URL on unmount
  React.useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      releaseBlobUrl()
    }
  }, [releaseBlobUrl])

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

  const handleTemplate = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    setTemplate({ file: files[0], progress: 100 })
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isLocked) {
      showUpgradeModal(featureKey!)
      return
    }
    handleFiles(e.dataTransfer.files)
  }

  const handleProcess = async () => {
    if (!primary || isLocked) return
    
    setStatus("uploading")
    setProgress(0)
    setErrorMsg(null)

    try {
      if (clientProcessor) {
        setStatus("processing")
        setProgress(20)
        setProgressMessage("Processing file locally...")
        
        const result = await clientProcessor(primary.file)
        
        setProgress(100)
        setStatus("success")
        setProgressMessage("Selesai!")
        setOutputFilename(result.filename)
        
        releaseBlobUrl()
        const url = URL.createObjectURL(result.blob)
        blobUrlRef.current = url
        setResultUrl(url)
        return
      }
      const supabase = getSupabaseClient()
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error("User not authenticated")

      // Batas ukuran file. Bucket 'uploads' dibatasi 50 MB di Supabase —
      // tanpa cek ini, file besar baru gagal setelah seluruh unggahan
      // selesai, dengan pesan error mentah dari storage.
      if (primary.file.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          locale === "id"
            ? `Ukuran file ${formatMb(primary.file.size)} melebihi batas ${formatMb(MAX_UPLOAD_BYTES)}.`
            : `File size ${formatMb(primary.file.size)} exceeds the ${formatMb(MAX_UPLOAD_BYTES)} limit.`
        )
      }
      if (template && template.file.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          locale === "id"
            ? `Ukuran template ${formatMb(template.file.size)} melebihi batas ${formatMb(MAX_UPLOAD_BYTES)}.`
            : `Template size ${formatMb(template.file.size)} exceeds the ${formatMb(MAX_UPLOAD_BYTES)} limit.`
        )
      }

      // Cek kuota lebih dulu supaya pesannya jelas. Penegakan sebenarnya
      // ada di RLS (lihat supabase/2026-08-29-quota-and-retention.sql) —
      // cek ini murni demi pesan error yang bisa dipahami user.
      const { data: quotaProfile } = await supabase
        .from('profiles')
        .select('quota_used, quota_limit')
        .eq('id', userData.user.id)
        .single()

      if (quotaProfile && (quotaProfile as any).quota_used >= (quotaProfile as any).quota_limit) {
        throw new Error(
          locale === "id"
            ? `Kuota bulanan Anda sudah habis (${(quotaProfile as any).quota_used}/${(quotaProfile as any).quota_limit}). Upgrade paket untuk melanjutkan.`
            : `Your monthly quota is used up (${(quotaProfile as any).quota_used}/${(quotaProfile as any).quota_limit}). Upgrade your plan to continue.`
        )
      }

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

      let templatePath: string | undefined = undefined;
      if (template) {
        const tplExt = template.file.name.split('.').pop()
        const tplName = `${crypto.randomUUID()}.${tplExt}`
        templatePath = `${userData.user.id}/${tplName}`
        const { error: tplUploadError } = await supabase.storage
          .from('uploads')
          .upload(templatePath, template.file, {
            cacheControl: '3600',
            upsert: false
          })
        if (tplUploadError) throw tplUploadError
      }

      setStatus("processing")
      setProgress(5)

      const resolvedToolName = toolName || featureKey || "kml_to_boq"

      // 2. Create Job in Supabase
      const newJobId = crypto.randomUUID()
      const { error: insertError } = await supabase.from('processing_jobs').insert({
        id: newJobId,
        user_id: userData.user.id,
        tool_name: resolvedToolName,
        original_filename: primary.file.name,
        original_file_url: filePath,
        original_file_size_bytes: primary.file.size,
        status: 'queued'
      })

      if (insertError) {
        // RLS menolak INSERT ketika kuota habis — terjemahkan pesan
        // teknisnya jadi sesuatu yang bisa dipahami user.
        const isQuotaBlock =
          insertError.code === '42501' ||
          /row-level security|violates row-level/i.test(insertError.message || '')

        throw new Error(
          isQuotaBlock
            ? (locale === "id"
                ? "Kuota bulanan Anda sudah habis. Upgrade paket untuk melanjutkan."
                : "Your monthly quota is used up. Upgrade your plan to continue.")
            : insertError.message
        )
      }

      setJobId(newJobId)

      // 3. Trigger Backend Processing
      const triggerRes = await jobApi.submitJob({
        job_id: newJobId,
        file_path: filePath,
        original_filename: primary.file.name,
        user_id: userData.user.id,
        tool_name: resolvedToolName as any,
        template_path: templatePath
      })

      if (!triggerRes.success) {
        throw new Error(triggerRes.error?.message || "Failed to trigger backend")
      }

      // 4. Start Polling
      startPolling(newJobId)

    } catch (err: any) {
      console.error(err)
      setStatus("error")
      setErrorMsg(err.message || "Failed to process file")
    }
  }

  const startPolling = (id: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    pollStartTimeRef.current = Date.now()
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        // Check for timeout
        const elapsed = Date.now() - pollStartTimeRef.current
        if (elapsed > POLL_TIMEOUT_MS) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setStatus("error")
          setErrorMsg("Processing timeout — backend tidak merespon. Silakan coba lagi atau hubungi support.")
          return
        }

        const supabase = getSupabaseClient()
        const { data: job, error } = await supabase
          .from('processing_jobs')
          .select('*')
          .eq('id', id)
          .single()

        if (error || !job) return

        // Update progress message if backend sends one
        if (job.progress_message) {
          setProgressMessage(job.progress_message)
        }
        
        if (job.status === 'queued' || job.status === 'processing') {
          // Use real progress from backend if available, otherwise artificial progress
          setProgress(prev => {
            if (job.progress_percent && job.progress_percent > 0) {
              return job.progress_percent
            }
            // Artificial progress: slow increments that asymptotically approach 90%
            if (job.status === 'queued') {
              // Slow progress while queued (5% → 15%)
              return prev < 15 ? prev + 1 : 15
            }
            // Faster progress during processing (up to 90%)
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
          setOutputFilename(job.output_filename)
          
          const finalUrl = job.output_file_url
          if (finalUrl) {
             // Create signed url valid for 1 hour to download the result securely
             const { data } = await supabase.storage.from('outputs').createSignedUrl(finalUrl, 3600)
             if (data?.signedUrl) {
                setResultUrl(data.signedUrl)
             }
          }
        } else {
          // failed / cancelled / expired — semuanya terminal. Sebelumnya
          // hanya 'failed' yang ditangani, sehingga status terminal lain
          // membuat polling berjalan terus sampai timeout.
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setStatus("error")
          setErrorMsg(job.error_message || "Processing gagal di backend")
        }
      } catch (err) {
        console.error("Polling error:", err)
      }
    }, 2000) // Poll every 2 seconds instead of 3 for faster feedback
  }

  const handleReset = () => {
    setPrimary(null)
    setTemplate(null)
    setStatus("idle")
    setProgress(0)
    setErrorMsg(null)
    setJobId(null)
    setResultUrl(null)
    setProgressMessage("")
    setOutputFilename(null)
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    releaseBlobUrl()
  }

  const handleDownload = () => {
    if (resultUrl) {
      if (resultUrl.startsWith('blob:')) {
        const a = document.createElement('a')
        a.href = resultUrl
        a.download = outputFilename || "result.csv"
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        window.open(resultUrl, '_blank')
      }
    }
  }

  // ============================================
  // DEVICE VERIFICATION & BLOCKED STATE
  // ============================================
  if (checkingDevice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary animate-pulse" />
        <p className="text-sm text-muted-foreground font-medium animate-pulse">
          {locale === "id" ? "Memverifikasi perangkat..." : "Verifying device..."}
        </p>
      </div>
    )
  }

  if (deviceBlocked) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 lg:gap-8 max-w-6xl">
        {/* Left side - description */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
                {title}
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                <ShieldAlert className="h-3 w-3" />
                {locale === "id" ? "TERBATAS" : "RESTRICTED"}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed text-pretty">
              {description}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm">
            <h2 className="text-sm font-medium">{locale === "id" ? "Format didukung" : "Supported formats"}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {acceptedFormats.map((f) => (
                <li
                  key={f}
                  className="font-mono text-xs px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] text-muted-foreground"
                >
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main — Locked overlay */}
        <div className="space-y-5">
          <div className="relative rounded-2xl border border-red-500/20 bg-card/40 backdrop-blur-sm overflow-hidden">
            {/* Blurred mock content */}
            <div className="p-5 border-b border-white/10 opacity-20 blur-[2px] pointer-events-none select-none">
              <h2 className="text-base font-medium">Upload files</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Drag and drop or click to browse
              </p>
            </div>

            <div className="p-5 opacity-10 blur-[3px] pointer-events-none select-none">
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/10 px-6 py-12">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-background">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Drop your KML/KMZ file here</p>
                  <p className="mt-1 text-xs text-muted-foreground">or click to browse — max 50MB</p>
                </div>
              </div>
            </div>

            {/* Upgrade / Reset CTA overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-background/85 backdrop-blur-[2px] p-6">
              <div className="text-center max-w-md">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-rose-600/20 ring-1 ring-red-500/30 mb-4 animate-pulse">
                  <ShieldAlert className="h-8 w-8 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-red-400">
                  {locale === "id" ? "Batas Perangkat Tercapai" : "Device Limit Reached"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {deviceBlockMsg || (
                    locale === "id" 
                      ? "Akun Anda telah mencapai batas maksimal perangkat terdaftar (maksimal 2 perangkat: 1 Laptop + 1 HP). Silakan gunakan perangkat terdaftar atau reset daftar perangkat." 
                      : "Your account has reached the maximum allowed devices (max 2 devices: 1 Laptop + 1 Phone). Please use a registered device or reset registered devices."
                  )}
                </p>

                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  {deviceBlockReason === "account_device_limit_exceeded" ? (
                    <button
                      onClick={handleResetDevices}
                      disabled={resettingDevices}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-500/20 cursor-pointer disabled:opacity-50"
                    >
                      {resettingDevices ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      {locale === "id" ? "Reset Perangkat Terdaftar" : "Reset Registered Devices"}
                    </button>
                  ) : (
                    <button
                      onClick={() => showUpgradeModal(featureKey)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-6 py-2.5 text-sm font-semibold text-white hover:from-red-400 hover:to-rose-500 transition-all shadow-lg shadow-red-500/20 cursor-pointer"
                    >
                      <Zap className="h-4 w-4" />
                      {locale === "id" ? "Upgrade Akun Sekarang" : "Upgrade Account Now"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // LOCKED STATE — Premium overlay
  // ============================================
  if (isLocked) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 lg:gap-8 max-w-6xl">
        {/* Left side - description */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
                {title}
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Crown className="h-3 w-3" />
                PRO
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed text-pretty">
              {description}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm">
            <h2 className="text-sm font-medium">Supported formats</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {acceptedFormats.map((f) => (
                <li
                  key={f}
                  className="font-mono text-xs px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] text-muted-foreground"
                >
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main — Locked overlay */}
        <div className="space-y-5">
          <div className="relative rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
            {/* Blurred mock content */}
            <div className="p-5 border-b border-white/10 opacity-30 blur-[2px] pointer-events-none select-none">
              <h2 className="text-base font-medium">Upload files</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Drag and drop or click to browse
              </p>
            </div>

            <div className="p-5 opacity-20 blur-[3px] pointer-events-none select-none">
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/10 px-6 py-12">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-background">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Drop your KML/KMZ file here</p>
                  <p className="mt-1 text-xs text-muted-foreground">or click to browse — max 50MB</p>
                </div>
              </div>
            </div>

            {/* Upgrade CTA overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
              <div className="text-center max-w-sm px-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/20 ring-1 ring-amber-500/30 mb-4">
                  <Lock className="h-8 w-8 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold">
                  This tool requires{" "}
                  <span className="text-amber-400">Pro</span>
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Upgrade your plan to unlock {title} and all other premium tools.
                </p>
                <button
                  onClick={() => showUpgradeModal(featureKey)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-semibold text-black hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
                >
                  <Zap className="h-4 w-4" />
                  Upgrade to Pro
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // UNLOCKED STATE — Normal tool page
  // ============================================
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 lg:gap-8 max-w-6xl">
      {/* Left side - description */}
      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed text-pretty">
            {description}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm">
          <h2 className="text-sm font-medium">Supported formats</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {acceptedFormats.map((f) => (
              <li
                key={f}
                className="font-mono text-xs px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] text-muted-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm">
          <h2 className="text-sm font-medium">Processing notes</h2>
          <ul className="mt-3 space-y-2">
            {processingNotes.map((n, i) => (
              <li
                key={i}
                className="flex gap-2 text-xs text-muted-foreground leading-relaxed"
              >
                <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-primary/70" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Tutorial link hint when video exists */}
        {hasTutorial && (
          <button
            type="button"
            onClick={() => setActiveTab("tutorial")}
            className="w-full flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left hover:bg-primary/10 transition-colors group"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:bg-primary/20 transition-colors">
              <PlayCircle className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary">Tutorial tersedia</p>
              <p className="text-xs text-muted-foreground mt-0.5">Klik untuk menonton panduan video</p>
            </div>
            <ChevronRight className="h-4 w-4 text-primary/60 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </aside>

      {/* Main area — Tabs if tutorial exists, plain upload otherwise */}
      <div className="space-y-5">
        {/* Tab header — only shown when tutorial is available */}
        {hasTutorial && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/10 w-fit">
            <button
              type="button"
              id="tab-tool"
              role="tab"
              aria-selected={activeTab === "tool"}
              onClick={() => setActiveTab("tool")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                activeTab === "tool"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Wrench className="h-3.5 w-3.5" />
              Tool
            </button>
            <button
              type="button"
              id="tab-tutorial"
              role="tab"
              aria-selected={activeTab === "tutorial"}
              onClick={() => setActiveTab("tutorial")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                activeTab === "tutorial"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Tutorial
            </button>
          </div>
        )}

        {/* ── TUTORIAL TAB ── */}
        <AnimatePresence mode="wait">
          {activeTab === "tutorial" && hasTutorial && (
            <motion.div
              key="tutorial-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              {/* YouTube embed */}
              <YouTubePlayer
                videoId={resolvedYoutubeId}
                title={`Tutorial: ${title}`}
                autoplay
              />

              {/* Step-by-step guide */}
              {tutorialEntry && tutorialEntry.steps.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
                  <div className="p-4 border-b border-white/10">
                    <h2 className="text-sm font-semibold">Panduan Langkah-demi-Langkah</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Ikuti langkah berikut untuk menggunakan tool ini</p>
                  </div>
                  <ol className="divide-y divide-white/5">
                    {tutorialEntry.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-4 p-4 hover:bg-white/[0.02] transition-colors">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold ring-1 ring-primary/20 mt-0.5">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{step.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Sample file download */}
              {tutorialEntry?.sampleFileUrl && (
                <div className="rounded-2xl border border-white/10 bg-card/40 p-4 flex items-center gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                    <Download className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">File Contoh</p>
                    <p className="text-xs text-muted-foreground">Download file contoh untuk dicoba langsung</p>
                  </div>
                  <a
                    href={tutorialEntry.sampleFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </div>
              )}

              {/* CTA to switch back to tool */}
              <button
                type="button"
                onClick={() => setActiveTab("tool")}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
              >
                <Wrench className="h-4 w-4" />
                Mulai gunakan tool
              </button>
            </motion.div>
          )}

          {/* ── TOOL TAB (or default when no tutorial) ── */}
          {activeTab === "tool" && (
            <motion.div
              key="tool-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
                <div className="p-5 border-b border-white/10">
                  <h2 className="text-base font-medium">Upload files</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Drag and drop or click to browse
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
                    aria-label="Upload primary file"
                  >
                    <input
                      ref={primaryInputRef}
                      type="file"
                      accept={primaryAccept}
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
                        Drop your KML/KMZ file here
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        or click to browse — max 50MB
                      </p>
                    </div>
                  </div>

                  {/* Selected primary file */}
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
                          aria-label="Remove file"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Optional Excel template */}
                  {supportsExcelTemplate && (
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Optional Excel template
                      </label>
                      <div className="mt-2">
                        {template ? (
                          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">
                              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {template.file.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {(template.file.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setTemplate(null)}
                              className="p-1 text-muted-foreground hover:text-foreground"
                              aria-label="Remove template"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => templateInputRef.current?.click()}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 bg-transparent px-4 py-3 text-sm text-muted-foreground hover:border-white/20 hover:text-foreground transition-colors"
                          >
                            <FileSpreadsheet className="h-4 w-4" />
                            Add Excel template (.xlsx)
                          </button>
                        )}
                        <input
                          ref={templateInputRef}
                          type="file"
                          accept=".xlsx,.xls"
                          className="sr-only"
                          onChange={(e) => handleTemplate(e.target.files)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    {status === "uploading" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            Uploading to Cloud...
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
                            {progressMessage || (progress < 10 ? "Antrian..." : "Sedang diproses...")}
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
                          "w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                          primary && status !== "success"
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-white/5 text-muted-foreground cursor-not-allowed",
                        )}
                      >
                        Process file
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
                        <h3 className="text-sm font-medium">Processing complete</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Your file is ready to download.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleDownload}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                          >
                            <Download className="h-4 w-4" />
                            Download result
                          </button>
                          <button
                            type="button"
                            onClick={handleReset}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm hover:border-white/30 transition-colors"
                          >
                            Process another
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
                        <h3 className="text-sm font-medium">Processing failed</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {errorMsg || "Something went wrong. Please try again."}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
