"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowUpRight, Activity, Files, Zap, Clock, Inbox } from "lucide-react"
import { dashboardMenu } from "@/lib/site-config"
import { useAuth } from "@/components/auth/auth-provider"
import { getSupabaseClient } from "@/lib/supabase/client"

interface JobStats {
  total: number
  completed: number
  failed: number
  pending: number
  processing: number
}

interface RecentJob {
  id: string
  original_filename: string
  tool_name: string
  status: string
  created_at: string
}

const toolLabels: Record<string, string> = {
  kml_to_boq: "KML to BOQ",
  kml_to_database: "KML to Database HP",
  kml_duplicate_checker: "KML Duplicate Checker",
  otdr_analyzer: "OTDR Analyzer",
  opm_calculator: "OPM Calculator",
  kml_to_csv: "KML to CSV",
  kml_to_shp: "KML to Shapefile",
  shp_to_kml: "Shapefile to KML",
  kml_to_dxf: "KML to AutoCAD (DXF)",
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? "s" : ""} ago`
}

export default function DashboardPage() {
  const { user, profile, isLoading: authLoading } = useAuth()
  const tools = dashboardMenu.filter((m) => m.href !== "/dashboard")

  const [stats, setStats] = useState<JobStats | null>(null)
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // Fetch real data from API
  useEffect(() => {
    if (!user) {
      setDataLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        const supabase = getSupabaseClient()
        
        // Fetch recent jobs
        const { data: recent, error: recentError } = await supabase
          .from('processing_jobs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5)

        if (!recentError && recent) {
          setRecentJobs(recent)
        }

        // Calculate stats from all jobs
        const { data: allJobs, error: statsError } = await supabase
          .from('processing_jobs')
          .select('status')
          .eq('user_id', user.id)
        
        if (!statsError && allJobs) {
          setStats({
            total: allJobs.length,
            completed: allJobs.filter((j) => j.status === "completed").length,
            failed: allJobs.filter((j) => j.status === "failed").length,
            pending: allJobs.filter((j) => j.status === "queued" || j.status === "pending").length,
            processing: allJobs.filter((j) => j.status === "processing").length,
          })
        }
      } catch (err) {
        console.error("Error fetching dashboard data:", err)
      } finally {
        setDataLoading(false)
      }
    }

    fetchData()
  }, [user])

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "there"

  const statCards = [
    {
      label: "Files processed",
      value: stats ? stats.total.toLocaleString() : "0",
      icon: Files,
      change: "",
    },
    {
      label: "Completed",
      value: stats ? stats.completed.toLocaleString() : "0",
      icon: Zap,
      change: "",
    },
    {
      label: "Active jobs",
      value: stats ? (stats.pending + stats.processing).toString() : "0",
      icon: Activity,
      change: "",
    },
    {
      label: "Quota remaining",
      value: profile
        ? `${profile.quota_limit - profile.quota_used}`
        : "—",
      icon: Clock,
      change: profile ? `of ${profile.quota_limit}` : "",
    },
  ]

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Welcome back{displayName !== "there" ? `, ${displayName}` : ""}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Pick a tool below or review your recent activity.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="rounded-2xl border border-white/10 bg-card/40 p-4 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{s.value}</span>
              {s.change && (
                <span className="text-xs text-primary">{s.change}</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tools quick access */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-4">
          Tools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tools.map((tool, i) => (
            <motion.div
              key={tool.href}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Link
                href={tool.href}
                className="group relative block h-full overflow-hidden rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-card/60"
              >
                <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <tool.icon className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
                <h3 className="relative mt-4 text-base font-medium">
                  {tool.title}
                </h3>
                <p className="relative mt-1 text-xs leading-relaxed text-muted-foreground">
                  {tool.description}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-4">
          Recent activity
        </h2>
        <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
          {dataLoading ? (
            <div className="p-8 text-center">
              <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
              <p className="mt-3 text-sm text-muted-foreground">Loading activity...</p>
            </div>
          ) : recentJobs.length > 0 ? (
            <ul className="divide-y divide-white/10">
              {recentJobs.map((job) => (
                <li
                  key={job.id}
                  className="flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">
                    <Files className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{job.original_filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {toolLabels[job.tool_name] || job.tool_name}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(job.created_at)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                        job.status === "completed"
                          ? "bg-primary/10 text-primary ring-primary/20"
                          : job.status === "failed"
                            ? "bg-red-500/10 text-red-400 ring-red-500/20"
                            : job.status === "processing"
                              ? "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20"
                              : "bg-white/5 text-muted-foreground ring-white/10"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          job.status === "completed"
                            ? "bg-primary"
                            : job.status === "failed"
                              ? "bg-red-400"
                              : job.status === "processing"
                                ? "bg-yellow-400 animate-pulse"
                                : "bg-muted-foreground"
                        }`}
                      />
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="mt-3 text-sm text-muted-foreground">
                No activity yet. Start by using one of the tools above.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
