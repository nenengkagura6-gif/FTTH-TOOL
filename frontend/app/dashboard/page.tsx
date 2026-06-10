"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowUpRight, Activity, Files, Zap, Clock, Inbox, Lock, Crown } from "lucide-react"
import {
  TOOL_CATEGORIES,
  getToolsByCategory,
  type DashboardMenuItem,
} from "@/lib/site-config"
import { useAuth } from "@/components/auth/auth-provider"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useUpgradeModal } from "@/components/upgrade-modal"
import { getSupabaseClient } from "@/lib/supabase/client"
import { dashboardTranslations } from "@/components/dashboard/dashboard-translations"
import { cn } from "@/lib/utils"

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

const toolLabelsEn: Record<string, string> = {
  kml_to_boq: "KML to BOQ",
  kml_to_database: "KML to Database HP",
  kml_duplicate_checker: "KML Duplicate Checker",
  otdr_analyzer: "OTDR Analyzer",
  opm_calculator: "OPM Calculator",
  kml_to_csv: "KML to CSV",
  kml_to_shp: "KML to Shapefile",
  shp_to_kml: "Shapefile to KML",
  kml_to_dxf: "KML to AutoCAD (DXF)",
  dxf_to_kml: "AutoCAD (DXF) to KML",
  kml_extractor: "KML Extractor",
  pole_sorter: "Pole Auto-Sorter",
  insert_coding: "Insert Coding KML",
}

const toolLabelsId: Record<string, string> = {
  kml_to_boq: "KML ke BOQ",
  kml_to_database: "KML ke Database HP",
  kml_duplicate_checker: "Pendeteksi Duplikat KML",
  otdr_analyzer: "Penganalisis Trace OTDR",
  opm_calculator: "Kalkulator Anggaran OPM",
  kml_to_csv: "KML ke CSV",
  kml_to_shp: "KML ke Shapefile",
  shp_to_kml: "Shapefile ke KML",
  kml_to_dxf: "KML ke AutoCAD (DXF)",
  dxf_to_kml: "AutoCAD (DXF) ke KML",
  kml_extractor: "Ekstraktor KML",
  pole_sorter: "Pengurut Tiang Otomatis",
  insert_coding: "Insert Coding KML",
}

// Category accent colors matching sidebar
const categoryCardAccent: Record<string, {
  gradient: string
  dotBg: string
  borderHover: string
  shadowHover: string
  iconActiveBg: string
  subtitleBadge: string
}> = {
  violet: {
    gradient: "from-violet-500/20",
    dotBg: "bg-gradient-to-br from-violet-500 to-blue-500",
    borderHover: "hover:border-violet-500/40",
    shadowHover: "hover:shadow-violet-500/10",
    iconActiveBg: "group-hover:bg-violet-500 group-active:bg-violet-500",
    subtitleBadge: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  },
  cyan: {
    gradient: "from-cyan-500/20",
    dotBg: "bg-gradient-to-br from-cyan-500 to-teal-500",
    borderHover: "hover:border-cyan-500/40",
    shadowHover: "hover:shadow-cyan-500/10",
    iconActiveBg: "group-hover:bg-cyan-500 group-active:bg-cyan-500",
    subtitleBadge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  },
  amber: {
    gradient: "from-amber-500/20",
    dotBg: "bg-gradient-to-br from-amber-500 to-orange-500",
    borderHover: "hover:border-amber-500/40",
    shadowHover: "hover:shadow-amber-500/10",
    iconActiveBg: "group-hover:bg-amber-500 group-active:bg-amber-500",
    subtitleBadge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  emerald: {
    gradient: "from-emerald-500/20",
    dotBg: "bg-gradient-to-br from-emerald-500 to-green-500",
    borderHover: "hover:border-emerald-500/40",
    shadowHover: "hover:shadow-emerald-500/10",
    iconActiveBg: "group-hover:bg-emerald-500 group-active:bg-emerald-500",
    subtitleBadge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
}

function timeAgo(dateStr: string, locale: "en" | "id"): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (locale === "id") {
    if (mins < 1) return "Baru saja"
    if (mins < 60) return `${mins} mnt lalu`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} jam lalu`
    const days = Math.floor(hours / 24)
    return `${days} hari lalu`
  } else {
    if (mins < 1) return "Just now"
    if (mins < 60) return `${mins} min ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`
    const days = Math.floor(hours / 24)
    return `${days} day${days > 1 ? "s" : ""} ago`
  }
}

export default function DashboardPage() {
  const { user, profile, isLoading: authLoading } = useAuth()
  const { canAccess } = useFeatureAccess()
  const { showUpgradeModal } = useUpgradeModal()
  const [locale, setLocale] = useState<"en" | "id">("en")

  const [stats, setStats] = useState<JobStats | null>(null)
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem("locale")
    if (stored === "id" || stored === "en") {
      setLocale(stored)
    }
  }, [])

  const dt = dashboardTranslations[locale]
  const toolLabels = locale === "id" ? toolLabelsId : toolLabelsEn

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
      label: dt.stats.processed,
      value: stats ? stats.total.toLocaleString() : "0",
      icon: Files,
      change: "",
    },
    {
      label: dt.stats.completed,
      value: stats ? stats.completed.toLocaleString() : "0",
      icon: Zap,
      change: "",
    },
    {
      label: dt.stats.active,
      value: stats ? (stats.pending + stats.processing).toString() : "0",
      icon: Activity,
      change: "",
    },
    {
      label: dt.stats.quota,
      value: profile
        ? `${profile.quota_limit - profile.quota_used}`
        : "—",
      icon: Clock,
      change: profile ? `${dt.stats.quotaOf} ${profile.quota_limit}` : "",
    },
  ]

  // Render a tool card
  const renderToolCard = (tool: DashboardMenuItem, i: number, accent: typeof categoryCardAccent.violet) => {
    const translatedTitle = dt.menuTitle[tool.title as keyof typeof dt.menuTitle] || tool.title
    const translatedDesc = dt.menuDesc[tool.description as keyof typeof dt.menuDesc] || tool.description
    const isLocked = tool.featureKey ? !canAccess(tool.featureKey) : false

    return (
      <motion.div
        key={tool.href}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: i * 0.04 }}
        whileTap={{ scale: 0.97 }}
      >
        {isLocked ? (
          <button
            type="button"
            onClick={() => tool.featureKey && showUpgradeModal(tool.featureKey)}
            className={cn(
              "group relative block h-full w-full text-left overflow-hidden rounded-2xl border border-border bg-card/90 p-5 backdrop-blur-sm shadow-md shadow-black/5 dark:shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:border-amber-500/40 hover:shadow-xl hover:shadow-amber-500/10 opacity-70",
            )}
          >
            <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-500/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
            <div className="relative flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-muted-foreground/50 ring-1 ring-white/10">
                <tool.icon className="h-4 w-4" />
              </div>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400/80 border border-amber-500/20">
                <Lock className="h-2.5 w-2.5" />
                PRO
              </span>
            </div>
            <h3 className="relative mt-4 text-base font-medium text-muted-foreground/70">
              {translatedTitle}
            </h3>
            <p className="relative mt-1 text-xs leading-relaxed text-muted-foreground/50">
              {translatedDesc}
            </p>
          </button>
        ) : (
          <Link
            href={tool.href}
            className={cn(
              "group relative block h-full overflow-hidden rounded-2xl border border-border bg-card/90 p-5 backdrop-blur-sm shadow-md shadow-black/5 dark:shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:bg-card/95 hover:shadow-xl active:border-primary/60 active:bg-card/95",
              accent.borderHover,
              accent.shadowHover,
            )}
          >
            <div className={cn(
              "pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100",
              accent.gradient,
            )} />
            <div className="relative flex items-start justify-between">
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 transition-all duration-300 group-hover:text-white group-hover:scale-105 group-hover:ring-primary/40",
                accent.iconActiveBg,
              )}>
                <tool.icon className="h-4 w-4" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>
            <h3 className="relative mt-4 text-base font-medium">
              {translatedTitle}
            </h3>
            <p className="relative mt-1 text-xs leading-relaxed text-muted-foreground">
              {translatedDesc}
            </p>
          </Link>
        )}
      </motion.div>
    )
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          {dt.welcome}{displayName !== "there" ? `, ${displayName}` : ""}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {dt.welcomeSub}
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
            whileHover={{ y: -2 }}
            className="group relative rounded-2xl border border-border bg-card/90 p-4 backdrop-blur-sm shadow-md shadow-black/5 dark:shadow-black/20 transition-all duration-300 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 group-hover:scale-110" />
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

      {/* Tools — grouped by category */}
      {TOOL_CATEGORIES.map((category, catIdx) => {
        const tools = getToolsByCategory(category.id)
        if (tools.length === 0) return null

        const accent = categoryCardAccent[category.accentColor]
        const categoryLabel = locale === "id"
          ? dt.categoryLabel[category.id as keyof typeof dt.categoryLabel]
          : category.label.en
        const categorySubtitle = locale === "id"
          ? dt.categorySubtitle[category.id as keyof typeof dt.categorySubtitle]
          : category.subtitle.en

        return (
          <motion.section
            key={category.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 + catIdx * 0.1 }}
          >
            {/* Category header */}
            <div className="flex items-center gap-3 mb-4">
              {/* Gradient accent bar */}
              <div
                className={cn(
                  "w-1 h-6 rounded-full bg-gradient-to-b",
                  category.accentGradient,
                )}
              />
              <div className="flex items-center gap-2">
                <category.icon className="h-4 w-4 text-muted-foreground/70" />
                <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wide">
                  {categoryLabel}
                </h2>
              </div>
              <span className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border",
                accent.subtitleBadge,
              )}>
                {categorySubtitle}
              </span>
            </div>

            {/* Tool cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tools.map((tool, i) => renderToolCard(tool, i, accent))}
            </div>
          </motion.section>
        )
      })}

      {/* Recent activity */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-4">
          {dt.recentActivity}
        </h2>
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-sm shadow-md shadow-black/5 dark:shadow-black/20 overflow-hidden">
          {dataLoading ? (
            <div className="p-8 text-center">
              <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
              <p className="mt-3 text-sm text-muted-foreground">{dt.loadingActivity}</p>
            </div>
          ) : recentJobs.length > 0 ? (
            <ul className="divide-y divide-border">
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
                      {timeAgo(job.created_at, locale)}
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
                {dt.noActivity}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
