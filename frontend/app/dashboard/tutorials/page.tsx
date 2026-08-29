"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  BookOpen,
  Search,
  PlayCircle,
  Download,
  X,
  ChevronRight,
  Video,
  Layers,
  ArrowLeftRight,
  Gauge,
  Wrench,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { TUTORIAL_DATA, type TutorialEntry } from "@/lib/tutorial-data"
import { YouTubePlayer } from "@/components/tutorial/youtube-player"
import type { ToolCategory } from "@/lib/site-config"

const CATEGORY_CONFIG: Record<ToolCategory, { label: string; labelId: string; icon: typeof Layers; color: string; bg: string; border: string }> = {
  survey: {
    label: "Drafter",
    labelId: "Drafter",
    icon: Layers,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
  },
  conversion: {
    label: "Format Conversion",
    labelId: "Konversi Format",
    icon: ArrowLeftRight,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
  },
  measurement: {
    label: "Measurement & Testing",
    labelId: "Pengukuran & Testing",
    icon: Gauge,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  utility: {
    label: "Utility",
    labelId: "Utilitas",
    icon: Wrench,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
}

const ALL_CATEGORIES: ToolCategory[] = ["survey", "conversion", "measurement", "utility"]

// YouTube thumbnail URL
function getYTThumb(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
}

interface TutorialModalProps {
  entry: TutorialEntry
  onClose: () => void
}

function TutorialModal({ entry, onClose }: TutorialModalProps) {
  const catConfig = CATEGORY_CONFIG[entry.category]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 lg:p-8 overflow-y-auto"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative z-10 w-full max-w-4xl bg-card border border-white/10 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg ring-1", catConfig.bg, catConfig.border)}>
                <catConfig.icon className={cn("h-4 w-4", catConfig.color)} />
              </div>
              <div>
                <h2 className="text-base font-semibold">{entry.toolTitle}</h2>
                <span className={cn("text-[11px] font-medium", catConfig.color)}>
                  {catConfig.label}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] divide-y lg:divide-y-0 lg:divide-x divide-white/10">
            {/* Left: Video */}
            <div className="p-5">
              {entry.youtubeId ? (
                <YouTubePlayer
                  videoId={entry.youtubeId}
                  title={`Tutorial: ${entry.toolTitle}`}
                  autoplay
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-white/[0.02] border border-white/10 py-16">
                  <Video className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Video belum tersedia</p>
                </div>
              )}

              {/* External YouTube link */}
              {entry.youtubeId && (
                <a
                  href={`https://www.youtube.com/watch?v=${entry.youtubeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Buka di YouTube
                </a>
              )}
            </div>

            {/* Right: Steps + Download */}
            <div className="flex flex-col">
              {/* Steps */}
              <div className="flex-1 p-5">
                <h3 className="text-sm font-semibold mb-4">Panduan Langkah-demi-Langkah</h3>
                <ol className="space-y-3">
                  {entry.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold ring-1 ring-primary/20 mt-0.5">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium leading-tight">{step.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Download */}
              {entry.sampleFileUrl && (
                <div className="p-5 border-t border-white/10">
                  <p className="text-xs text-muted-foreground mb-3">File contoh untuk dicoba</p>
                  <a
                    href={entry.sampleFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 w-full rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 hover:bg-emerald-500/10 transition-colors group"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Download className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-400">Download File Contoh</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-emerald-400/60 group-hover:translate-x-0.5 transition-transform" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

interface TutorialCardProps {
  entry: TutorialEntry
  index: number
  onClick: () => void
}

function TutorialCard({ entry, index, onClick }: TutorialCardProps) {
  const catConfig = CATEGORY_CONFIG[entry.category]
  const hasVideo = Boolean(entry.youtubeId)

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      whileHover={{ y: -2 }}
      className="group relative text-left rounded-2xl border border-border bg-card/90 backdrop-blur-sm shadow-md shadow-black/5 dark:shadow-black/20 overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
    >
      {/* Thumbnail / Placeholder */}
      <div className="relative aspect-video overflow-hidden bg-black/40">
        {hasVideo ? (
          <>
            {/* YouTube thumbnail */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getYTThumb(entry.youtubeId)}
              alt={`${entry.toolTitle} tutorial thumbnail`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Play overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                <PlayCircle className="h-6 w-6 text-gray-900" />
              </div>
            </div>
          </>
        ) : (
          /* Coming soon placeholder */
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
            <Video className="h-8 w-8 text-muted-foreground/20" />
            <span className="text-[11px] text-muted-foreground/40 font-medium">Video segera hadir</span>
          </div>
        )}

        {/* Category badge */}
        <div className={cn(
          "absolute top-2 left-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border",
          catConfig.bg, catConfig.color, catConfig.border,
        )}>
          <catConfig.icon className="h-2.5 w-2.5" />
          {catConfig.label}
        </div>
      </div>

      {/* Card body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight">{entry.toolTitle}</h3>
          {hasVideo && (
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
          {entry.steps.length} langkah panduan
          {entry.sampleFileUrl && " · File contoh tersedia"}
        </p>

        {/* Steps preview */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.steps.slice(0, 3).map((step, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 bg-white/[0.03] border border-white/10 px-1.5 py-0.5 rounded">
              <span className="font-medium text-primary/70">{i + 1}.</span>
              {step.title}
            </span>
          ))}
          {entry.steps.length > 3 && (
            <span className="inline-flex items-center text-[10px] text-muted-foreground/50 px-1.5 py-0.5">
              +{entry.steps.length - 3} lainnya
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}

export default function TutorialsPage() {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState<ToolCategory | "all">("all")
  const [selectedEntry, setSelectedEntry] = useState<TutorialEntry | null>(null)

  const filtered = useMemo(() => {
    return TUTORIAL_DATA.filter((entry) => {
      const matchesSearch =
        search.length === 0 ||
        entry.toolTitle.toLowerCase().includes(search.toLowerCase()) ||
        entry.toolTitleId.toLowerCase().includes(search.toLowerCase())
      const matchesCategory =
        activeCategory === "all" || entry.category === activeCategory
      return matchesSearch && matchesCategory
    })
  }, [search, activeCategory])

  const videosAvailable = TUTORIAL_DATA.filter((t) => t.youtubeId).length

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Video Tutorial</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {videosAvailable > 0
                ? `${videosAvailable} dari ${TUTORIAL_DATA.length} tutorial tersedia`
                : `Panduan video untuk semua ${TUTORIAL_DATA.length} tool`}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Search + Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Cari tutorial..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
          />
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              activeCategory === "all"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Semua
          </button>
          {ALL_CATEGORIES.map((cat) => {
            const c = CATEGORY_CONFIG[cat]
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  activeCategory === cat
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <c.icon className={cn("h-3 w-3", activeCategory === cat ? c.color : "")} />
                {c.label}
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* Results count */}
      {(search || activeCategory !== "all") && (
        <p className="text-xs text-muted-foreground -mt-4">
          {filtered.length} hasil ditemukan
          {search && <> untuk &quot;<strong>{search}</strong>&quot;</>}
        </p>
      )}

      {/* Tutorial Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((entry, i) => (
            <TutorialCard
              key={entry.toolSlug}
              entry={entry}
              index={i}
              onClick={() => setSelectedEntry(entry)}
            />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 gap-4"
        >
          <BookOpen className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Tidak ada tutorial yang ditemukan</p>
          <button
            type="button"
            onClick={() => { setSearch(""); setActiveCategory("all") }}
            className="text-xs text-primary hover:underline"
          >
            Reset filter
          </button>
        </motion.div>
      )}

      {/* Tutorial Modal */}
      <AnimatePresence>
        {selectedEntry && (
          <TutorialModal
            entry={selectedEntry}
            onClose={() => setSelectedEntry(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
