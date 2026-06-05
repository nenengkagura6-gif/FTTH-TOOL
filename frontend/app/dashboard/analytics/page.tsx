"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Zap,
  Clock,
  TrendingUp,
  PieChart,
  Activity,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"

const toolLabels: Record<string, string> = {
  kml_to_boq: "KML to BOQ",
  kml_to_database: "KML to DB HP",
  kml_duplicate_checker: "Dup Checker",
  otdr_analyzer: "OTDR",
  opm_calculator: "OPM",
  kml_to_csv: "KML to CSV",
  kml_to_shp: "KML to SHP",
  shp_to_kml: "SHP to KML",
  kml_to_dxf: "KML to DXF",
  dxf_to_kml: "DXF to KML",
  kml_folder_extractor: "Folder Extractor",
}

const toolColors: Record<string, string> = {
  kml_to_boq: "bg-cyan-500",
  kml_to_database: "bg-violet-500",
  kml_duplicate_checker: "bg-emerald-500",
  otdr_analyzer: "bg-amber-500",
  opm_calculator: "bg-rose-500",
  kml_to_csv: "bg-indigo-500",
  kml_to_shp: "bg-blue-500",
  shp_to_kml: "bg-teal-500",
  kml_to_dxf: "bg-orange-500",
  dxf_to_kml: "bg-lime-500",
  kml_folder_extractor: "bg-yellow-500",
}

interface AnalyticsData {
  stats: { totalJobs: number; completed: number; failed: number; successRate: number; avgProcessingTimeMs: number }
  quota: { used: number; limit: number; plan: string; resetsAt: string | null }
  toolUsage: Record<string, number>
  dailyChart: { date: string; completed: number; failed: number; total: number }[]
}

export default function AnalyticsPage() {
  const { isLoading: authLoading, profile } = useAuth()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !profile) return
    const fetchAnalytics = async () => {
      try {
        const { getSupabaseClient } = await import("@/lib/supabase/client")
        const supabase = getSupabaseClient()
        
        const fourteenDaysAgo = new Date()
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
        
        const { data: jobs, error } = await supabase
          .from('processing_jobs')
          .select('created_at, status, tool_name, processing_time_ms')
          .eq('user_id', profile.id)
          .gte('created_at', fourteenDaysAgo.toISOString())
          
        if (error) throw error
        
        const totalJobs = jobs.length
        const completed = jobs.filter(j => j.status === 'completed').length
        const failed = jobs.filter(j => j.status === 'failed').length
        const successRate = totalJobs > 0 ? Math.round((completed / totalJobs) * 100) : 0
        
        const completedJobsWithTime = jobs.filter(j => j.status === 'completed' && j.processing_time_ms)
        const avgProcessingTimeMs = completedJobsWithTime.length > 0
          ? completedJobsWithTime.reduce((acc, j) => acc + (j.processing_time_ms || 0), 0) / completedJobsWithTime.length
          : 0
          
        const toolUsage: Record<string, number> = {}
        jobs.forEach(j => {
          toolUsage[j.tool_name] = (toolUsage[j.tool_name] || 0) + 1
        })
        
        const dailyChartMap: Record<string, { completed: number; failed: number; total: number }> = {}
        for (let i = 13; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          dailyChartMap[d.toISOString().split('T')[0]] = { completed: 0, failed: 0, total: 0 }
        }
        
        jobs.forEach(j => {
          const dateStr = j.created_at.split('T')[0]
          if (dailyChartMap[dateStr]) {
            dailyChartMap[dateStr].total++
            if (j.status === 'completed') dailyChartMap[dateStr].completed++
            if (j.status === 'failed') dailyChartMap[dateStr].failed++
          }
        })
        
        setData({
          stats: { totalJobs, completed, failed, successRate, avgProcessingTimeMs },
          toolUsage,
          dailyChart: Object.entries(dailyChartMap).map(([date, stats]) => ({ date, ...stats })),
          quota: {
            used: profile.quota_used || 0,
            limit: profile.quota_limit || 100,
            plan: profile.plan || 'free',
            resetsAt: profile.quota_reset_at || null
          }
        })
      } catch (err) {
        console.error("Error fetching analytics:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchAnalytics()
  }, [authLoading, profile])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const maxDaily = Math.max(...data.dailyChart.map(d => d.total), 1)
  const totalToolUsage = Object.values(data.toolUsage).reduce((a, b) => a + b, 0) || 1
  const quotaPercent = Math.round((data.quota.used / data.quota.limit) * 100)

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          Analytics
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your processing stats and usage overview
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Jobs", value: data.stats.totalJobs, icon: Activity, color: "text-primary" },
          { label: "Success Rate", value: `${data.stats.successRate}%`, icon: TrendingUp, color: "text-emerald-400" },
          { label: "Completed", value: data.stats.completed, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Failed", value: data.stats.failed, icon: XCircle, color: "text-red-400" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm p-5"
          >
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
              <stat.icon className={cn("h-4 w-4", stat.color)} />
              <span className="text-xs font-medium">{stat.label}</span>
            </div>
            <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Daily Chart */}
        <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm p-5">
          <h2 className="text-sm font-medium mb-4">Jobs · Last 14 days</h2>
          <div className="flex items-end gap-1 h-40">
            {data.dailyChart.map((day, i) => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                {/* Tooltip */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                  <div className="bg-card border border-white/10 rounded-lg px-2 py-1 text-[10px] whitespace-nowrap shadow-lg">
                    <p className="font-medium">{day.date.slice(5)}</p>
                    <p className="text-emerald-400">✓ {day.completed}</p>
                    {day.failed > 0 && <p className="text-red-400">✗ {day.failed}</p>}
                  </div>
                </div>
                {/* Bar */}
                <div className="w-full flex flex-col gap-px" style={{ height: `${(day.total / maxDaily) * 100}%`, minHeight: day.total > 0 ? '4px' : '2px' }}>
                  {day.completed > 0 && (
                    <div
                      className="w-full bg-emerald-500/70 rounded-t-sm"
                      style={{ flex: day.completed }}
                    />
                  )}
                  {day.failed > 0 && (
                    <div
                      className="w-full bg-red-500/70 rounded-b-sm"
                      style={{ flex: day.failed }}
                    />
                  )}
                  {day.total === 0 && (
                    <div className="w-full bg-white/5 rounded-sm h-full" />
                  )}
                </div>
                {/* Label (every other) */}
                {i % 2 === 0 && (
                  <span className="text-[9px] text-muted-foreground/50">{day.date.slice(8)}</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500/70" /> Completed</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500/70" /> Failed</span>
          </div>
        </div>

        {/* Tool Usage */}
        <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm p-5">
          <h2 className="text-sm font-medium mb-4">Tool Usage</h2>
          <div className="space-y-3">
            {Object.entries(data.toolUsage)
              .sort((a, b) => b[1] - a[1])
              .map(([tool, count]) => (
                <div key={tool}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">{toolLabels[tool] || tool}</span>
                    <span className="font-mono font-medium">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(count / totalToolUsage) * 100}%` }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                      className={cn("h-full rounded-full", toolColors[tool] || "bg-primary")}
                    />
                  </div>
                </div>
              ))}
            {Object.keys(data.toolUsage).length === 0 && (
              <p className="text-xs text-muted-foreground/50 text-center py-6">No data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Quota Card */}
      <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Quota Usage
          </h2>
          <span className="text-xs text-muted-foreground capitalize px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.03]">
            {data.quota.plan} plan
          </span>
        </div>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-semibold">{data.quota.used}</span>
              <span className="text-sm text-muted-foreground">/ {data.quota.limit}</span>
            </div>
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(quotaPercent, 100)}%` }}
                transition={{ duration: 0.8 }}
                className={cn(
                  "h-full rounded-full",
                  quotaPercent > 90 ? "bg-red-500" : quotaPercent > 70 ? "bg-amber-500" : "bg-primary"
                )}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.quota.limit - data.quota.used} remaining this month
              {data.quota.resetsAt && ` · Resets ${new Date(data.quota.resetsAt).toLocaleDateString()}`}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
