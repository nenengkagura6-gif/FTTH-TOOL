"use client"

import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Download,
  RotateCcw,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  FileText,
  Inbox,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"

// ============================================
// Types
// ============================================

interface Job {
  id: string
  original_filename: string
  tool_name: string
  status: "pending" | "processing" | "completed" | "failed" | "cancelled"
  created_at: string
  completed_at: string | null
  started_at: string | null
  progress_percent: number
  progress_message: string | null
  error_message: string | null
  result_file_url: string | null
  original_file_size_bytes: number | null
  processing_time_ms: number | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

// ============================================
// Constants
// ============================================

const toolLabels: Record<string, string> = {
  kml_to_boq: "KML to BOQ",
  kml_to_database: "KML to Database HP",
  kml_duplicate_checker: "Duplicate Checker",
  otdr_analyzer: "OTDR Analyzer",
  opm_calculator: "OPM Calculator",
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  completed: {
    label: "Success",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-gray-400",
    bg: "bg-gray-500/10 border-gray-500/20",
  },
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)

  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  })
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—"
  if (ms < 1000) return `${ms}ms`
  const secs = (ms / 1000).toFixed(1)
  return `${secs}s`
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

// ============================================
// Component
// ============================================

export default function HistoryPage() {
  const { isLoading: authLoading } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [toolFilter, setToolFilter] = useState("all")
  const [page, setPage] = useState(1)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(toolFilter !== "all" && { tool: toolFilter }),
      })

      const res = await fetch(`/api/jobs/history?${params}`)
      if (!res.ok) throw new Error("Failed to fetch")

      const data = await res.json()
      setJobs(data.jobs || [])
      setPagination(data.pagination || null)
    } catch (err) {
      console.error("Error fetching history:", err)
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, toolFilter])

  useEffect(() => {
    if (!authLoading) {
      fetchHistory()
    }
  }, [authLoading, fetchHistory])

  // Smart polling for active jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(job => job.status === "pending" || job.status === "processing")
    
    if (hasActiveJobs) {
      const intervalId = setInterval(() => {
        fetchHistory()
      }, 5000) // Poll every 5 seconds
      
      return () => clearInterval(intervalId)
    }
  }, [jobs, fetchHistory])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [statusFilter, toolFilter])

  const handleRetry = async (jobId: string) => {
    // TODO: Implement retry via API
    console.log("Retry job:", jobId)
  }

  const handleDownload = async (url: string | null) => {
    if (!url) return
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const supabase = getSupabaseClient()
      const { data } = await supabase.storage.from("outputs").createSignedUrl(url, 3600)
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank")
      }
    } catch (err) {
      console.error("Download error:", err)
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <History className="h-5 w-5 text-primary" />
            </div>
            Processing History
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Track and manage all your file processing jobs
          </p>
        </div>

        <button
          onClick={fetchHistory}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors self-start"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Status filter */}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-card/40 backdrop-blur-sm px-3 py-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-sm outline-none cursor-pointer text-foreground"
          >
            <option value="all" className="bg-card text-foreground">All Status</option>
            <option value="completed" className="bg-card text-foreground">✅ Success</option>
            <option value="failed" className="bg-card text-foreground">❌ Failed</option>
            <option value="processing" className="bg-card text-foreground">⏳ Processing</option>
            <option value="pending" className="bg-card text-foreground">🕐 Pending</option>
            <option value="cancelled" className="bg-card text-foreground">🚫 Cancelled</option>
          </select>
        </div>

        {/* Tool filter */}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-card/40 backdrop-blur-sm px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={toolFilter}
            onChange={(e) => setToolFilter(e.target.value)}
            className="bg-transparent text-sm outline-none cursor-pointer text-foreground"
          >
            <option value="all" className="bg-card text-foreground">All Tools</option>
            {Object.entries(toolLabels).map(([key, label]) => (
              <option key={key} value={key} className="bg-card text-foreground">
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Stats */}
        {pagination && (
          <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
            <span>{pagination.total} total jobs</span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
        {/* Header row */}
        <div className="hidden sm:grid sm:grid-cols-[2fr_1.2fr_0.8fr_0.8fr_0.6fr_1fr] gap-4 px-5 py-3 border-b border-white/10 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <span>File</span>
          <span>Tool</span>
          <span>Status</span>
          <span>Date</span>
          <span>Size</span>
          <span className="text-right">Action</span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-3 text-sm text-muted-foreground">Loading history...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] ring-1 ring-white/10 mb-4">
              <Inbox className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No processing history yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Your processed files will appear here
            </p>
          </div>
        )}

        {/* Job rows */}
        {!loading && jobs.length > 0 && (
          <ul className="divide-y divide-white/5">
            <AnimatePresence>
              {jobs.map((job, i) => {
                const config = statusConfig[job.status] || statusConfig.pending
                const StatusIcon = config.icon

                return (
                  <motion.li
                    key={job.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="group"
                  >
                    {/* Desktop row */}
                    <div className="hidden sm:grid sm:grid-cols-[2fr_1.2fr_0.8fr_0.8fr_0.6fr_1fr] gap-4 items-center px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                      {/* File */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 flex-shrink-0">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium truncate">
                          {job.original_filename}
                        </span>
                      </div>

                      {/* Tool */}
                      <span className="text-sm text-muted-foreground truncate">
                        {toolLabels[job.tool_name] || job.tool_name}
                      </span>

                      {/* Status */}
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border",
                          config.bg,
                          config.color,
                        )}>
                          <StatusIcon className={cn(
                            "h-3 w-3",
                            job.status === "processing" && "animate-spin",
                          )} />
                          {config.label}
                        </span>
                      </div>

                      {/* Date */}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(job.created_at)}
                      </span>

                      {/* Size */}
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatFileSize(job.original_file_size_bytes)}
                      </span>

                      {/* Action */}
                      <div className="flex items-center justify-end gap-2">
                        {job.status === "completed" && (
                          <button
                            onClick={() => handleDownload(job.result_file_url)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors ring-1 ring-primary/20"
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </button>
                        )}
                        {job.status === "failed" && (
                          <button
                            onClick={() => handleRetry(job.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors ring-1 ring-amber-500/20"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </button>
                        )}
                        {job.status === "processing" && (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                              <div
                                className="h-full bg-blue-400 rounded-full transition-all"
                                style={{ width: `${job.progress_percent}%` }}
                              />
                            </div>
                            <span className="text-xs text-blue-400 font-mono">
                              {job.progress_percent}%
                            </span>
                          </div>
                        )}
                        {job.status === "pending" && (
                          <span className="text-xs text-muted-foreground/50">Queued</span>
                        )}
                      </div>
                    </div>

                    {/* Mobile card */}
                    <div className="sm:hidden px-4 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 flex-shrink-0">
                            <FileText className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{job.original_filename}</p>
                            <p className="text-xs text-muted-foreground">{toolLabels[job.tool_name] || job.tool_name}</p>
                          </div>
                        </div>
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border flex-shrink-0",
                          config.bg,
                          config.color,
                        )}>
                          <StatusIcon className={cn("h-3 w-3", job.status === "processing" && "animate-spin")} />
                          {config.label}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatDate(job.created_at)}</span>
                        <span className="font-mono">{formatFileSize(job.original_file_size_bytes)}</span>
                      </div>

                      {job.status === "completed" && (
                        <button
                          onClick={() => handleDownload(job.result_file_url)}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors ring-1 ring-primary/20"
                        >
                          <Download className="h-3 w-3" />
                          Download Result
                        </button>
                      )}
                      {job.status === "failed" && (
                        <div className="space-y-2">
                          {job.error_message && (
                            <p className="text-xs text-red-400/70 bg-red-500/5 rounded-lg px-3 py-2 border border-red-500/10">
                              {job.error_message}
                            </p>
                          )}
                          <button
                            onClick={() => handleRetry(job.id)}
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors ring-1 ring-amber-500/20"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </button>
                        </div>
                      )}
                      {job.status === "processing" && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full bg-blue-400 rounded-full transition-all"
                              style={{ width: `${job.progress_percent}%` }}
                            />
                          </div>
                          <span className="text-xs text-blue-400 font-mono">{job.progress_percent}%</span>
                        </div>
                      )}
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs transition-colors",
                page <= 1
                  ? "text-muted-foreground/30 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5",
              )}
            >
              <ChevronLeft className="h-3 w-3" />
              Previous
            </button>

            {/* Page numbers */}
            <div className="hidden sm:flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum: number
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      "h-7 w-7 rounded-md text-xs font-medium transition-colors",
                      pageNum === page
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-white/5",
                    )}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={!pagination.hasMore}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs transition-colors",
                !pagination.hasMore
                  ? "text-muted-foreground/30 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5",
              )}
            >
              Next
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
