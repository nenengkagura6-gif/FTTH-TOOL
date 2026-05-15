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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useUpgradeModal } from "@/components/upgrade-modal"
import type { FeatureKey } from "@/lib/features"
import { getSupabaseClient } from "@/lib/supabase/client"

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
}

type Status = "idle" | "uploading" | "processing" | "success" | "error"

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
}: ToolPageProps) {
  const [primary, setPrimary] = useState<UploadFile | null>(null)
  const [template, setTemplate] = useState<UploadFile | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  
  const primaryInputRef = useRef<HTMLInputElement>(null)
  const templateInputRef = useRef<HTMLInputElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const { canAccess } = useFeatureAccess()
  const { showUpgradeModal } = useUpgradeModal()
  const isLocked = featureKey ? !canAccess(featureKey) : false

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
      const supabase = getSupabaseClient()
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error("User not authenticated")
      
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

      // 2. Create Job
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: featureKey || "kml_to_boq", // Fallback for testing
          original_filename: primary.file.name,
          original_file_url: filePath,
          original_file_size_bytes: primary.file.size
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to create job")
      }

      const { job } = await res.json()
      setJobId(job.id)

      // 3. Start Polling
      startPolling(job.id)

    } catch (err: any) {
      console.error(err)
      setStatus("error")
      setErrorMsg(err.message || "Failed to process file")
    }
  }

  const startPolling = (id: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`)
        if (!res.ok) return
        
        const { job } = await res.json()
        
        if (job.status === 'processing') {
          // Artificial progress if backend doesn't send real progress
          setProgress(prev => {
             if (job.progress_percent > 0) return job.progress_percent
             return prev < 90 ? prev + 5 : 90
          })
        } else if (job.status === 'completed') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setStatus("success")
          setProgress(100)
          
          if (job.result_file_url) {
             const supabase = getSupabaseClient()
             // Create signed url valid for 1 hour to download the result securely
             const { data } = await supabase.storage.from('outputs').createSignedUrl(job.result_file_url, 3600)
             if (data?.signedUrl) {
                setResultUrl(data.signedUrl)
             }
          }
        } else if (job.status === 'failed') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setStatus("error")
          setErrorMsg(job.error_message || "Processing failed at backend")
        }
      } catch (err) {
        console.error("Polling error:", err)
      }
    }, 3000)
  }

  const handleReset = () => {
    setPrimary(null)
    setTemplate(null)
    setStatus("idle")
    setProgress(0)
    setErrorMsg(null)
    setJobId(null)
    setResultUrl(null)
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
  }

  const handleDownload = () => {
    if (resultUrl) {
       window.open(resultUrl, '_blank')
    }
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
      </aside>

      {/* Main upload card */}
      <div className="space-y-5">
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
                      {progress < 10 ? "Queued..." : "Processing..."}
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
      </div>
    </div>
  )
}
